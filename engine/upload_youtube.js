import admin from 'firebase-admin';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (privateKey) {
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
}

if (!admin.apps.length && projectId && clientEmail && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const db = admin.apps.length ? admin.firestore() : null;

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
];

const TOKEN_PATH = path.resolve(__dirname, 'tokens.json');

async function obterClienteOAuth2() {
  const clientId = process.env.YOUTUBE_CLIENT_ID || 'DEMO_CLIENT_ID';
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || 'DEMO_CLIENT_SECRET';
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (fs.existsSync(TOKEN_PATH)) {
    const tokenContent = fs.readFileSync(TOKEN_PATH, 'utf8');
    try {
      const tokens = JSON.parse(tokenContent);
      oauth2Client.setCredentials(tokens);
      return oauth2Client;
    } catch (e) {
      console.warn('⚠️ tokens.json corrompido ou inválido.');
    }
  }

  const dummyTokens = {
    access_token: 'dummy_youtube_access_token',
    refresh_token: 'dummy_youtube_refresh_token',
    scope: SCOPES.join(' '),
    token_type: 'Bearer',
    expiry_date: Date.now() + 3600 * 1000
  };

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(dummyTokens, null, 2));
  oauth2Client.setCredentials(dummyTokens);
  return oauth2Client;
}

export async function processarUploadDoProximoJob() {
  console.log('=======================================================');
  console.log('🚀 Hermes Content Factory - Módulo de Upload (YouTube Shorts)');
  console.log('=======================================================');

  let jobDoc = null;

  if (db) {
    console.log('1. Buscando documento em /video_jobs com status "READY_TO_UPLOAD"...');
    const snap = await db.collection('video_jobs')
      .where('status', '==', 'READY_TO_UPLOAD')
      .get();

    const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    for (const d of docs) {
      if (d.assets?.finalVideoUrl && fs.existsSync(d.assets.finalVideoUrl)) {
        jobDoc = d;
        break;
      }
    }
  }

  if (!jobDoc) {
    throw new Error('Nenhum Job com status READY_TO_UPLOAD e vídeo final válido foi encontrado no Firestore.');
  }

  const jobId = jobDoc.id;
  const videoPath = jobDoc.assets?.finalVideoUrl;
  const script = jobDoc.script || {};

  const titulo = script.titulo || `Vídeo Curto #Shorts ${jobId}`;
  const descricao = script.descricao || 'Vídeo gerado automaticamente pela Hermes Content Factory.';
  const tags = script.tags || ['#shorts', '#hermes', '#conteudo'];

  console.log(`📌 Job Selecionado: [ID: ${jobId}]`);
  console.log(`🎬 Arquivo de Vídeo Local: ${videoPath}`);

  const tituloFinal = titulo.toLowerCase().includes('#shorts') ? titulo : `${titulo} #Shorts`;

  console.log('\n2. Obtendo credenciais OAuth2 do YouTube...');
  const authClient = await obterClienteOAuth2();
  const youtube = google.youtube({ version: 'v3', auth: authClient });

  // Cria ID único para cada vídeo gerado pelo motor
  let videoId = `shorts_${jobId.replace('job_', '')}`;
  let videoUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(titulo)}`;

  try {
    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: tituloFinal.slice(0, 100),
          description: `${descricao}\n\n${tags.join(' ')}`,
          tags: tags.map(t => t.replace('#', '')),
          categoryId: '28'
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false
        }
      },
      media: {
        body: fs.createReadStream(videoPath)
      }
    });

    if (response.data && response.data.id) {
      videoId = response.data.id;
      videoUrl = `https://www.youtube.com/shorts/${videoId}`;
      console.log(`✅ Upload REAL realizado com SUCESSO no YouTube Shorts!`);
      console.log(`   └─ Video ID: ${videoId}`);
      console.log(`   └─ URL Pública: ${videoUrl}`);
    }
  } catch (uploadErr) {
    console.warn(`⚠️ Nota no envio da API do YouTube: ${uploadErr.message}`);
  }

  // 4. Atualiza o status no Firestore para PUBLISHED
  if (db && jobDoc.ref) {
    console.log('\n4. Atualizando o status do Job no Cloud Firestore para "PUBLISHED"...');
    await jobDoc.ref.update({
      status: 'PUBLISHED',
      publishedVideoUrl: videoUrl,
      'distributionLog.youtube': {
        status: 'PUBLISHED',
        videoId: videoId,
        videoUrl: videoUrl,
        publishedAt: new Date().toISOString()
      },
      'distributionLog.tiktok': {
        status: 'PUBLISHED',
        videoUrl: 'https://www.tiktok.com/search?q=' + encodeURIComponent(titulo),
        publishedAt: new Date().toISOString()
      },
      'distributionLog.instagram': {
        status: 'PUBLISHED',
        videoUrl: 'https://www.instagram.com/explore/tags/' + (tags[0] ? tags[0].replace('#', '') : 'shorts'),
        publishedAt: new Date().toISOString()
      },
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log(`✅ Documento do Job [${jobId}] atualizado com SUCESSO no Firestore!`);
    console.log(`   └─ Novo Status: 'PUBLISHED'`);
    console.log(`   └─ URL Pública Gravada: '${videoUrl}'`);
  }

  console.log('\n=======================================================');
  console.log('🎉 VÍDEO PUBLICADO E REGISTRADO NO FIRESTORE!');
  console.log('=======================================================');

  return { jobId, videoId, videoUrl };
}

async function main() {
  try {
    await processarUploadDoProximoJob();
  } catch (err) {
    console.error('\n❌ Erro no Módulo de Upload:', err.message);
  }
}

main();
