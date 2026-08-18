import admin from 'firebase-admin';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configura o caminho do binário estático do FFmpeg
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

// Carrega as variáveis de ambiente do .env na raiz
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

// Inicializa o Firebase Admin SDK
if (!admin.apps.length && projectId && clientEmail && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

const db = admin.apps.length ? admin.firestore() : null;

/**
 * Garante que o arquivo fundo.mp4 de teste exista (formato vertical 1080x1920)
 */
async function garantirVideoFundo(fundoPath) {
  if (fs.existsSync(fundoPath)) return fundoPath;

  console.log('🎥 Gerando vídeo de fundo de teste (fundo.mp4 1080x1920)...');
  const dir = path.dirname(fundoPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=0x0f172a:s=1080x1920:r=30')
      .inputOptions(['-f lavfi'])
      .outputOptions(['-t 15', '-c:v libx264', '-pix_fmt yuv420p'])
      .output(fundoPath)
      .on('end', () => {
        console.log('✅ Vídeo de fundo fundo.mp4 criado com sucesso!');
        resolve(fundoPath);
      })
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Módulo de Renderização de Vídeo (FFmpeg) com Legendas Queimadas (Hardsubs)
 */
export async function processarRenderizacaoDoProximoJob() {
  console.log('=======================================================');
  console.log('🎬 Hermes Content Factory - Módulo de Renderização com Legendas Queimadas (Hardsubs)');
  console.log('=======================================================');

  let jobDoc = null;

  if (db) {
    console.log('1. Buscando documento recente em /video_jobs com status "VIDEO_RENDER"...');
    const snap = await db.collection('video_jobs')
      .where('status', '==', 'VIDEO_RENDER')
      .get();

    const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    for (const d of docs) {
      if (d.assets?.audioUrl && fs.existsSync(d.assets.audioUrl) && fs.statSync(d.assets.audioUrl).size > 500) {
        jobDoc = d;
        break;
      }
    }
  }

  if (!jobDoc) {
    throw new Error('Nenhum Job com status VIDEO_RENDER e áudio válido foi encontrado no Firestore.');
  }

  const jobId = jobDoc.id;
  const audioPath = jobDoc.assets?.audioUrl;
  const subtitlePath = jobDoc.assets?.subtitleUrl;

  console.log(`📌 Job Selecionado: [ID: ${jobId}]`);
  console.log(`🎵 Áudio MP3: ${audioPath}`);
  console.log(`📝 Legendas VTT: ${subtitlePath || 'Nenhuma legenda vinculada'}`);

  const outputDir = path.resolve(__dirname, '../output/videos');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const fundoPath = path.join(__dirname, 'fundo.mp4');
  await garantirVideoFundo(fundoPath);

  const finalVideoName = `job_${jobId}_final.mp4`;
  const outputVideoPath = path.join(outputDir, finalVideoName);

  console.log('\n2. Renderizando vídeo com FFmpeg: Mesclando fundo.mp4 + narração MP3 + Legendas Queimadas (.vtt)...');

  // Formatação de escape de caminho de legenda para o filtro FFmpeg no Windows
  let videoFilters = [];

  if (subtitlePath && fs.existsSync(subtitlePath)) {
    const escapedVttPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const subtitleFilter = `subtitles='${escapedVttPath}':force_style='Alignment=2,Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,MarginV=180'`;
    videoFilters.push(subtitleFilter);
    console.log(`🎨 Aplicando Filtro de Legendas Queimadas (Hardsubs): ${subtitleFilter}`);
  }

  await new Promise((resolve, reject) => {
    let command = ffmpeg()
      .input(fundoPath)
      .input(audioPath);

    if (videoFilters.length > 0) {
      command.videoFilters(videoFilters);
    }

    command
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-shortest'
      ])
      .output(outputVideoPath)
      .on('start', (commandLine) => {
        console.log(`\n⚙️ Linha de Comando FFmpeg Executada:\n${commandLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`⏳ Progresso: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`\n✅ Vídeo com legendas queimadas (Hardsubs) renderizado com SUCESSO!`);
        console.log(`   └─ Salvo em: ${outputVideoPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('❌ Erro na renderização FFmpeg:', err.message);
        reject(err);
      })
      .run();
  });

  // 3. Atualiza o status no Firestore para READY_TO_UPLOAD
  if (db && jobDoc.ref) {
    console.log('\n3. Atualizando o status do Job no Firestore...');
    await jobDoc.ref.update({
      status: 'READY_TO_UPLOAD',
      'assets.finalVideoUrl': outputVideoPath,
      'assets.finalVideoFileName': finalVideoName,
      videoRenderedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log(`✅ Documento do Job [${jobId}] atualizado no Firestore!`);
    console.log(`   └─ Novo Status: 'READY_TO_UPLOAD'`);
    console.log(`   └─ Caminho do Vídeo Final: '${outputVideoPath}'`);
  }

  console.log('\n=======================================================');
  console.log('🎉 Módulo de Renderização com Legendas Queimadas CONCLUÍDO!');
  console.log('=======================================================');

  return { jobId, videoPath: outputVideoPath };
}

async function main() {
  try {
    await processarRenderizacaoDoProximoJob();
  } catch (err) {
    console.error('\n❌ Erro no Módulo de Renderização:', err.message);
  }
}

main();
