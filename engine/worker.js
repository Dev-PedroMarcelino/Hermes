import { db } from './src/config/firebase.js';
import { config } from './src/config/env.js';
import { runPreflight } from './src/config/preflight.js';
import { executeVideoPipeline, JOB_STATUS } from './src/services/pipelineOrchestrator.js';

/**
 * Hermes production worker.
 *
 * Watches Firestore for jobs in QUEUED and runs the real pipeline on each one,
 * strictly one at a time (FFmpeg rendering is CPU-bound, and running several
 * renders concurrently on one machine only makes them all slower).
 *
 * This replaces the previous mock worker, which wrote the literal string
 * "HEADER_MP4_HERMES_RENDERED" into a .mp4 file and marked jobs PUBLISHED with a
 * hardcoded YouTube ID — nothing was ever rendered or uploaded.
 */

const POLL_INTERVAL_MS = 15000;
/** A job stuck in a working state longer than this is considered abandoned. */
const STALE_JOB_MS = 30 * 60 * 1000;

const WORKING_STATES = [
  JOB_STATUS.SCRIPTING,
  JOB_STATUS.AUDIO_GEN,
  JOB_STATUS.MEDIA_FETCH,
  JOB_STATUS.VIDEO_RENDER,
  JOB_STATUS.READY_TO_UPLOAD,
  JOB_STATUS.UPLOADING
];

let busy = false;
let shuttingDown = false;

/**
 * Reclaims jobs abandoned by a previous worker crash so they do not sit in a
 * working state forever.
 */
async function requeueStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_JOB_MS).toISOString();
  const snapshot = await db.collection('video_jobs').where('status', 'in', WORKING_STATES).get();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if ((data.updatedAt || data.createdAt || '') < cutoff) {
      console.warn(`[Worker] Job ${doc.id} travado desde ${data.updatedAt} — devolvendo para a fila.`);
      await doc.ref.set(
        { status: JOB_STATUS.QUEUED, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
  }
}

/**
 * Claims and processes the oldest queued job, if any.
 * @returns {Promise<boolean>} true when a job was processed
 */
async function processNextJob() {
  const snapshot = await db
    .collection('video_jobs')
    .where('status', '==', JOB_STATUS.QUEUED)
    .limit(10)
    .get();

  if (snapshot.empty) return false;

  const jobs = snapshot.docs.sort((a, b) =>
    (a.data().createdAt || '').localeCompare(b.data().createdAt || '')
  );

  const jobDoc = jobs[0];
  const job = jobDoc.data();

  // Claim the job transactionally so a second worker cannot pick up the same one
  const claimed = await db.runTransaction(async tx => {
    const fresh = await tx.get(jobDoc.ref);
    if (!fresh.exists || fresh.data().status !== JOB_STATUS.QUEUED) return false;
    tx.set(
      fresh.ref,
      { status: JOB_STATUS.SCRIPTING, claimedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return true;
  });

  if (!claimed) return false;

  console.log(`\n[Worker] ▶ Processando job ${jobDoc.id} (canal ${job.tenantId})`);
  try {
    await executeVideoPipeline({
      tenantId: job.tenantId,
      jobId: jobDoc.id,
      customTopic: job.customTopic || null,
      customInstruction: job.customInstruction || null
    });
    console.log(`[Worker] ✔ Job ${jobDoc.id} concluído.`);
  } catch (err) {
    // executeVideoPipeline already recorded FAILED + errorMessage on the document
    console.error(`[Worker] ✖ Job ${jobDoc.id} falhou: ${err.message}`);
  }

  return true;
}

async function tick() {
  if (busy || shuttingDown) return;
  busy = true;
  try {
    // Drain the queue before going back to sleep
    while (!shuttingDown && (await processNextJob())) {
      /* keep going */
    }
  } catch (err) {
    console.error('[Worker] Erro no ciclo:', err.message);
  } finally {
    busy = false;
  }
}

async function main() {
  console.log('=======================================================');
  console.log('🚀 HERMES WORKER — esteira de produção real');
  console.log(`   Projeto Firebase: ${config.firebase.projectId}`);
  console.log(`   Intervalo de verificação: ${POLL_INTERVAL_MS / 1000}s`);
  console.log('=======================================================');

  // Fail fast on a bad clock or missing keys rather than after a long render
  await runPreflight();

  await requeueStaleJobs();

  // Realtime listener reacts the instant the dashboard queues something...
  db.collection('video_jobs')
    .where('status', '==', JOB_STATUS.QUEUED)
    .onSnapshot(
      snapshot => {
        if (!snapshot.empty) tick();
      },
      err => console.error('[Worker] Erro no listener do Firestore:', err.message)
    );

  // ...and a poll covers listener drops and reconnects.
  setInterval(tick, POLL_INTERVAL_MS);
  await tick();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\n[Worker] Encerrando após o job atual...');
    shuttingDown = true;
    setTimeout(() => process.exit(0), busy ? 5000 : 0);
  });
}

main().catch(err => {
  console.error('[Worker] Falha fatal:', err);
  process.exit(1);
});
