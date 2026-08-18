import admin from 'firebase-admin';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

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

async function garantirVideoFundo(fundoPath) {
  if (fs.existsSync(fundoPath)) return fundoPath;

  console.log('🎥 Gerando fundo em alta resolução 1080x1920 (FFmpeg lavfi)...');
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

export async function processarRenderizacaoDoProximoJob() {
  console.log('=======================================================');
  console.log('🎬 HERMES REAL RENDER: FFmpeg + Hardsubs + Narração');
  console.log('=======================================================');

  if (!db) {
    throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');
  }

  console.log('1. Buscando o próximo documento em /video_jobs com status "VIDEO_RENDER"...');
  const snap = await db.collection('video_jobs')
    .where('status', '==', 'VIDEO_RENDER')
    .get();

  if (snap.empty) {
    throw new Error('❌ Nenhum documento com status "VIDEO_RENDER" foi encontrado em /video_jobs.');
  }

  const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const jobDoc = docs[0];
  const jobId = jobDoc.id;
  const audioPath = jobDoc.assets?.audioUrl;
  const subtitlePath = jobDoc.assets?.subtitleUrl;

  if (!audioPath || !fs.existsSync(audioPath)) {
    throw new Error(`❌ O arquivo de áudio físico não existe no caminho: ${audioPath}`);
  }

  console.log(`📌 Job Selecionado: [ID: ${jobId}]`);
  console.log(`🎵 Áudio MP3 Entrada: ${audioPath}`);
  console.log(`📝 Legendas VTT Entrada: ${subtitlePath || 'Nenhuma legenda'}`);

  const outputDir = path.resolve(__dirname, '../output/videos');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const fundoPath = path.join(__dirname, 'fundo.mp4');
  await garantirVideoFundo(fundoPath);

  const finalVideoName = `job_${jobId}_final.mp4`;
  const outputVideoPath = path.join(outputDir, finalVideoName);

  console.log('\n2. Executando renderização REAL via FFmpeg (com flag -shortest e Hardsubs)...');

  let videoFilters = [];
  if (subtitlePath && fs.existsSync(subtitlePath)) {
    const escapedVttPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const subtitleFilter = `subtitles='${escapedVttPath}':force_style='Alignment=2,Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,MarginV=180'`;
    videoFilters.push(subtitleFilter);
    console.log(`🎨 Aplicando filtro de legendas queimadas: ${subtitleFilter}`);
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
        console.log(`⚙️ FFmpeg Command:\n${commandLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`⏳ Progresso da Renderização: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`\n✅ Renderização FFmpeg REAL concluída com SUCESSO!`);
        console.log(`   └─ Vídeo MP4 Final: ${outputVideoPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('❌ Erro na execução do FFmpeg:', err.message);
        reject(err);
      })
      .run();
  });

  if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
    throw new Error(`❌ O arquivo de vídeo final MP4 não foi gerado em: ${outputVideoPath}`);
  }

  // 3. Atualiza o status no Firestore para READY_TO_UPLOAD
  console.log('\n3. Atualizando o status do Job no Firestore para "READY_TO_UPLOAD"...');
  await jobDoc.ref.update({
    status: 'READY_TO_UPLOAD',
    'assets.finalVideoUrl': outputVideoPath,
    'assets.finalVideoFileName': finalVideoName,
    videoRenderedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`✅ Documento do Job [${jobId}] atualizado com SUCESSO no Firestore!`);
  console.log(`   └─ Novo Status: 'READY_TO_UPLOAD'`);

  return { jobId, videoPath: outputVideoPath };
}

async function main() {
  try {
    await processarRenderizacaoDoProximoJob();
  } catch (err) {
    console.error('❌ Erro no Módulo de Renderização FFmpeg:', err.message);
    process.exit(1);
  }
}

main();
