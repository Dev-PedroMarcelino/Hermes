import { processarRenderizacaoDoProximoJob } from './engine/gerador_video.js';

async function main() {
  try {
    await processarRenderizacaoDoProximoJob();
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

main();
