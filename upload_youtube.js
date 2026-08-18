import { processarUploadDoProximoJob } from './engine/upload_youtube.js';

async function run() {
  try {
    await processarUploadDoProximoJob();
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

run();
