import { processarRenderizacaoDoProximoJob } from './engine/gerador_video.js';

async function run() {
  try {
    await processarRenderizacaoDoProximoJob();
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

run();
