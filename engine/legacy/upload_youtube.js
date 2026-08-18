import admin from 'firebase-admin';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
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

/**
 * Autenticação OAuth2 Real para a API do YouTube v3
 */
async function obterClienteOAuth2Real() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';

  if (!clientId || !clientSecret) {
    throw new Error('❌ ERRO CRÍTICO: YOUTUBE_CLIENT_ID e YOUTUBE_CLIENT_SECRET devem estar configurados no arquivo .env!');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // 1. Se tokens.json existir no disco, carrega e usa
  if (fs.existsSync(TOKEN_PATH)) {
    const tokenContent = fs.readFileSync(TOKEN_PATH, 'utf8');
    try {
      const tokens = JSON.parse(tokenContent);
      oauth2Client.setCredentials(tokens);

      oauth2Client.on('tokens', (newTokens) => {
        const updated = { ...tokens, ...newTokens };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
      });

      return oauth2Client;
    } catch (e) {
      console.warn('⚠️ tokens.json inválido. Reiniciando autenticação...');
    }
  }

  // 2. Se tokens.json NÃO existir, gera a URL no terminal e aguarda entrada via readline
  console.log('\n=======================================================');
  console.log('🔑 AUTENTICAÇÃO OAUTH2 DO YOUTUBE REQUERIDA');
  console.log('=======================================================');

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('\n1. Abra este link no seu navegador para logar na sua conta do Google/YouTube:');
  console.log(`\n👉 ${authUrl}\n`);
  console.log('2. Faça o login, autorize o aplicativo e COPIE o código de autorização exibido.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise((resolve) => {
    rl.question('\nPaste authorization code here: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!code) {
    throw new Error('❌ Nenhum código de autorização foi fornecido.');
  }

  console.log('\n🔄 Solicitando tokens de acesso da API do Google...');
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`✅ Tokens OAuth2 salvos com SUCESSO em: ${TOKEN_PATH}`);

  return oauth2Client;
}

/**
 * Upload Real no YouTube Shorts via API v3
 */
export async function processarUploadDoProximoJob() {
  console.log('=======================================================');
  console.log('🚀 HERMES REAL UPLOAD: YouTube Shorts (googleapis v3)');
  console.log('=======================================================');

  if (!db) {
    throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');
  }

  console.log('1. Buscando o documento em /video_jobs com status "READY_TO_UPLOAD"...');
  const snap = await db.collection('video_jobs')
    .where('status', '==', 'READY_TO_UPLOAD')
    .get();

  if (snap.empty) {
    throw new Error('❌ Nenhum documento com status "READY_TO_UPLOAD" foi encontrado em /video_jobs.');
  }

  const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const jobDoc = docs[0];
  const jobId = jobDoc.id;
  const videoPath = jobDoc.assets?.finalVideoUrl;
  const script = jobDoc.script || {};

  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error(`❌ Arquivo de vídeo final MP4 não existe no caminho: ${videoPath}`);
  }

  const titulo = script.titulo || `Shorts ${jobId}`;
  const descricao = script.descricao || 'Vídeo gerado automaticamente pela Hermes Content Factory.';
  const tags = script.tags || ['#shorts', '#viral'];
  const tituloFinal = titulo.toLowerCase().includes('#shorts') ? titulo : `${titulo} #Shorts`;

  console.log(`📌 Job Selecionado: [ID: ${jobId}]`);
  console.log(`🎬 Arquivo MP4: ${videoPath}`);
  console.log(`📝 Título: "${tituloFinal}"`);

  console.log('\n2. Inicializando cliente OAuth2 do YouTube...');
  const authClient = await obterClienteOAuth2Real();
  const youtube = google.youtube({ version: 'v3', auth: authClient });

  console.log('\n3. Executando youtube.videos.insert real com o buffer do arquivo MP4...');

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

  if (!response.data || !response.data.id) {
    throw new Error('❌ Falha na resposta da API do YouTube. O vídeo não retornou um ID válido.');
  }

  const videoId = response.data.id;
  const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

  console.log(`\n✅ Upload REAL realizado com SUCESSO no YouTube Shorts!`);
  console.log(`   └─ Video ID: ${videoId}`);
  console.log(`   └─ URL Pública: ${videoUrl}`);

  // 4. Atualiza o status no Firestore para PUBLISHED
  console.log('\n4. Atualizando o documento no Firestore para "PUBLISHED"...');
  await jobDoc.ref.update({
    status: 'PUBLISHED',
    publishedVideoUrl: videoUrl,
    'distributionLog.youtube': {
      status: 'PUBLISHED',
      videoId: videoId,
      videoUrl: videoUrl,
      publishedAt: new Date().toISOString()
    },
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`✅ Documento do Job [${jobId}] atualizado com SUCESSO no Firestore!`);
  console.log(`   └─ Novo Status: 'PUBLISHED'`);
  console.log(`   └─ URL Salva: '${videoUrl}'`);

  return { jobId, videoId, videoUrl };
}

async function main() {
  try {
    await processarUploadDoProximoJob();
  } catch (err) {
    console.error('❌ Erro no Módulo de Upload do YouTube:', err.message);
    process.exit(1);
  }
}

main();
