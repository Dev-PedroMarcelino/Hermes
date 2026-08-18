import { processarAudioDoProximoJob } from './engine/gerador_audio.js';

async function run() {
  try {
    await processarAudioDoProximoJob();
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

run();
