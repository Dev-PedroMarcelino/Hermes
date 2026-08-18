import { processarAudioDoProximoJob } from './engine/gerador_audio.js';

async function main() {
  try {
    await processarAudioDoProximoJob();
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
