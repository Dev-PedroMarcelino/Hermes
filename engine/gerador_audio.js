import admin from 'firebase-admin';
import nodeEdgeTts from 'node-edge-tts';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const { EdgeTTS } = nodeEdgeTts;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Formata segundos no padrão WebVTT: 00:00:01.500
 */
function formatVttTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Gera um arquivo de legendas WebVTT (.vtt) sincronizado por frases/palavras
 */
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
    // Quebra frases longas em blocos curtos de 3 a 5 palavras para legendas virais
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

/**
 * Módulo de Geração de Áudio (TTS) e Legendas WebVTT (.vtt)
 */
export async function processarAudioDoProximoJob() {
  console.log('=======================================================');
  console.log('🔊 Hermes Content Factory - Módulo de Áudio (TTS) + Legendas (.vtt)');
  console.log('=======================================================');

  let jobDoc = null;

  if (db) {
    console.log('1. Buscando o primeiro documento em /video_jobs com status "AUDIO_GEN"...');
    const snap = await db.collection('video_jobs')
      .where('status', '==', 'AUDIO_GEN')
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      jobDoc = { id: doc.id, ref: doc.ref, ...doc.data() };
    }
  }

  // Se nenhum job estiver pendente, cria um job de teste com o status AUDIO_GEN
  if (!jobDoc) {
    const testJobId = `job_${Date.now()}`;
    jobDoc = {
      id: testJobId,
      status: 'AUDIO_GEN',
      script: {
        titulo: 'O supercomputador que prevê o futuro climático',
        roteiro_locucao: 'Você sabia que existem sistemas de inteligência artificial desenvolvidos para operar sem supervisão humana? No topo da lista estão algoritmos militares e modelos autônomos capazes de tomar decisões em frações de segundos. O futuro já começou e a revolução digital é inevitável.'
      }
    };

    if (db) {
      const newRef = db.collection('video_jobs').doc(testJobId);
      await newRef.set(jobDoc);
      jobDoc.ref = newRef;
    }
  }

  const jobId = jobDoc.id;
  const roteiroLocucao = jobDoc.script?.roteiro_locucao || jobDoc.script?.roteiroLocucao;

  if (!roteiroLocucao) {
    throw new Error(`O Job [${jobId}] não possui o campo 'roteiro_locucao' preenchido.`);
  }

  console.log(`📌 Job Selecionado: [ID: ${jobId}]`);
  console.log(`🗣️ Texto para síntese: "${roteiroLocucao.substring(0, 85)}..."`);

  // Diretórios locais para áudio e legendas
  const audioDir = path.resolve(__dirname, '../output/audios');
  const subtitleDir = path.resolve(__dirname, '../output/subtitles');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  if (!fs.existsSync(subtitleDir)) fs.mkdirSync(subtitleDir, { recursive: true });

  const audioFileName = `${jobId}_narration.mp3`;
  const subtitleFileName = `${jobId}_subtitles.vtt`;
  const outputAudioPath = path.join(audioDir, audioFileName);
  const outputVttPath = path.join(subtitleDir, subtitleFileName);

  console.log('\n2. Sintetizando áudio MP3 (pt-BR-AntonioNeural) e gerando legendas WebVTT (.vtt)...');

  const tts = new EdgeTTS({
    voice: 'pt-BR-AntonioNeural',
    lang: 'pt-BR',
    outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
  });

  await tts.ttsPromise(roteiroLocucao, outputAudioPath);
  console.log(`✅ Áudio MP3 gerado em: ${outputAudioPath}`);

  // Gera o arquivo .vtt com os tempos das palavras/frases
  gerarLegendaVtt(roteiroLocucao, outputVttPath);
  console.log(`✅ Legendas WebVTT geradas em: ${outputVttPath}`);

  // 3. Atualiza o Firestore salvando audioUrl, subtitleUrl e altera status para VIDEO_RENDER
  if (db && jobDoc.ref) {
    console.log('\n3. Atualizando o documento no Firestore...');
    await jobDoc.ref.update({
      status: 'VIDEO_RENDER',
      'assets.audioUrl': outputAudioPath,
      'assets.subtitleUrl': outputVttPath,
      'assets.audioFileName': audioFileName,
      'assets.subtitleFileName': subtitleFileName,
      audioGeneratedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log(`✅ Documento do Job [${jobId}] atualizado no Firestore!`);
    console.log(`   └─ Status: 'VIDEO_RENDER'`);
    console.log(`   └─ Áudio: '${outputAudioPath}'`);
    console.log(`   └─ Legendas VTT: '${outputVttPath}'`);
  }

  console.log('\n=======================================================');
  console.log('🎉 Módulo de Áudio e Legendas WebVTT concluído com SUCESSO!');
  console.log('=======================================================');

  return { jobId, audioPath: outputAudioPath, vttPath: outputVttPath };
}

async function main() {
  try {
    await processarAudioDoProximoJob();
  } catch (err) {
    console.error('\n❌ Erro no Módulo de Áudio:', err.message);
  }
}

main();
