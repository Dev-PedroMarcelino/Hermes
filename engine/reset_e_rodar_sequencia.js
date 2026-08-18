import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { processarAudioDoProximoJob } from './gerador_audio.js';
import { processarRenderizacaoDoProximoJob } from './gerador_video.js';

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

async function resetERodar() {
  console.log('=======================================================');
  console.log('🔄 Hermes Content Factory - Reset e Execução Sequencial');
  console.log('=======================================================');

  if (db) {
    console.log('1. Buscando e resetando o status do Job recente no Firestore para "AUDIO_GEN"...');
    const snap = await db.collection('video_jobs').limit(5).get();
    
    if (!snap.empty) {
      const doc = snap.docs[0];
      await doc.ref.update({
        status: 'AUDIO_GEN',
        updatedAt: new Date().toISOString()
      });
      console.log(`✅ Status do Job [${doc.id}] alterado de volta para 'AUDIO_GEN'!`);
    }
  }

  // 2. Executa Módulo de Áudio + Legendas WebVTT
  console.log('\n=======================================================');
  console.log('▶️ EXECUTANDO MÓDULO DE ÁUDIO & LEGENDAS (gerador_audio.js)');
  console.log('=======================================================');
  await processarAudioDoProximoJob();

  // 3. Executa Módulo de Renderização de Vídeo com Hardsubs
  console.log('\n=======================================================');
  console.log('▶️ EXECUTANDO MÓDULO DE RENDERIZAÇÃO DE VÍDEO (gerador_video.js)');
  console.log('=======================================================');
  await processarRenderizacaoDoProximoJob();

  console.log('\n=======================================================');
  console.log('🎉 PIPELINE COMPLETA DE ÁUDIO, LEGENDAS VTT E VÍDEO CONCLUÍDA!');
  console.log('=======================================================');
}

resetERodar();
