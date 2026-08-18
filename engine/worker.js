import { config } from './src/config/env.js';
import { runPreflight } from './src/config/preflight.js';
import { startWorkerLoop } from './src/worker/productionWorker.js';

/**
 * Standalone worker process.
 *
 * Use this when the host offers a dedicated background-worker service. On free
 * plans that only provide a web service, set ENABLE_WORKER=true instead and the
 * API process runs the same loop in-process.
 */

console.log('=======================================================');
console.log('🚀 HERMES WORKER — esteira de produção');
console.log(`   Projeto Firebase: ${config.firebase.projectId}`);
console.log(`   Saída de vídeo:   ${config.paths.output}`);
console.log('=======================================================');

let stop = () => {};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[Worker] Encerrando...');
    stop();
    process.exit(0);
  });
}

// Fail fast on a bad clock or missing keys rather than after a long render
await runPreflight();
stop = await startWorkerLoop();
