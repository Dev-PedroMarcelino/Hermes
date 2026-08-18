import admin from 'firebase-admin';
import nodeEdgeTts from 'node-edge-tts';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { EdgeTTS } = nodeEdgeTts;

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

function formatVttTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function gerarLegendaVtt(textoLocucao, outputVttPath) {
  const dir = path.dirname(outputVttPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const frases = textoLocucao.match(/[^.!?]+[.!?]+/g) || [textoLocucao];
  let currentTime = 0.5;

  let vttContent = 'WEBVTT\n\n';

  for (const frase of frases) {
    const trimmed = frase.trim();
    if (!trimmed) continue;

    const palavras = trimmed.split(/\s+/);
    const chunkSize = 4;
    for (let i = 0; i < palavras.length; i += chunkSize) {
      const chunk = palavras.slice(i, i + chunkSize).join(' ');
      const duracao = Math.max(1.5, chunk.split(/\s+/).length * 0.38);
      const endTime = currentTime + duracao;

      vttContent += `${formatVttTime(currentTime)} --> ${formatVttTime(endTime)}\n${chunk.toUpperCase()}\n\n`;
      currentTime = endTime + 0.15;
    }
  }

  fs.writeFileSync(outputVttPath, vttContent, 'utf8');
  return outputVttPath;
}

export async function processarAudioDoProximoJob() {
  console.log('=======================================================');
  console.log('🔊 HERMES REAL TTS: Síntese de Voz & Legendas WebVTT');
  console.log('=======================================================');

  if (!db) {
    throw new Error('❌ Conexão com o Cloud Firestore não foi inicializada.');
  }

  console.log('1. Buscando o próximo Job no Firestore em /video_jobs com status "AUDIO_GEN"...');
  const snap = await db.collection('video_jobs')
    .where('status', '==', 'AUDIO_GEN')
    .get();

  if (snap.empty) {
    throw new Error('❌ Nenhum documento com status "AUDIO_GEN" foi encontrado em /video_jobs.');
  }

  const docs = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const jobDoc = docs[0];
  const jobId = jobDoc.id;
  const roteiroLocucao = jobDoc.script?.roteiro_locucao;

  if (!roteiroLocucao) {
    throw new Error(`❌ O Job [${jobId}] não possui o campo "roteiro_locucao" preenchido no Firestore.`);
  }

  console.log(`📌 Job Selecionado: [ID: ${jobId}]`);
  console.log(`🗣️ Texto da Narração: "${roteiroLocucao.substring(0, 90)}..."`);

  const audioDir = path.resolve(__dirname, '../output/audios');
  const subtitleDir = path.resolve(__dirname, '../output/subtitles');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  if (!fs.existsSync(subtitleDir)) fs.mkdirSync(subtitleDir, { recursive: true });

  const audioFileName = `${jobId}_narration.mp3`;
  const subtitleFileName = `${jobId}_subtitles.vtt`;
  const outputAudioPath = path.join(audioDir, audioFileName);
  const outputVttPath = path.join(subtitleDir, subtitleFileName);

  console.log('\n2. Sintetizando voz neural pt-BR via EdgeTTS e salvando arquivo físico MP3...');

  const tts = new EdgeTTS({
    voice: 'pt-BR-AntonioNeural',
    lang: 'pt-BR',
    outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
  });

  await tts.ttsPromise(roteiroLocucao, outputAudioPath);

  if (!fs.existsSync(outputAudioPath) || fs.statSync(outputAudioPath).size === 0) {
    throw new Error(`❌ Falha ao criar o arquivo de áudio físico em: ${outputAudioPath}`);
  }

  console.log(`✅ Arquivo físico MP3 criado com SUCESSO (${fs.statSync(outputAudioPath).size} bytes):`);
  console.log(`   └─ ${outputAudioPath}`);

  // Gera as legendas .vtt físicas
  gerarLegendaVtt(roteiroLocucao, outputVttPath);
  console.log(`✅ Arquivo físico WebVTT criado com SUCESSO:`);
  console.log(`   └─ ${outputVttPath}`);

  // Atualiza o documento no Firestore com status VIDEO_RENDER
  console.log('\n3. Atualizando o Job no Firestore com status "VIDEO_RENDER"...');
  await jobDoc.ref.update({
    status: 'VIDEO_RENDER',
    'assets.audioUrl': outputAudioPath,
    'assets.subtitleUrl': outputVttPath,
    'assets.audioFileName': audioFileName,
    'assets.subtitleFileName': subtitleFileName,
    audioGeneratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log(`✅ Documento do Job [${jobId}] atualizado com SUCESSO no Firestore!`);
  console.log(`   └─ Novo Status: 'VIDEO_RENDER'`);

  return { jobId, audioPath: outputAudioPath, vttPath: outputVttPath };
}

async function main() {
  try {
    await processarAudioDoProximoJob();
  } catch (err) {
    console.error('❌ Erro no Módulo de Áudio EdgeTTS:', err.message);
    process.exit(1);
  }
}

main();
