import { db } from '../config/firebase.js';
import { executeVideoPipeline, JOB_STATUS } from '../services/pipelineOrchestrator.js';
import { pruneExpiredStates } from '../services/oauthService.js';

/**
 * Hermes production worker.
 *
 * Drains the `video_jobs` queue one job at a time. Rendering is CPU-bound, so
 * running several jobs at once on one machine only makes them all slower —
 * especially on a small free-tier container.
 *
 * Exposed as a module so it can run either as its own process (`engine/worker.js`)
 * or inside the API process (`ENABLE_WORKER=true`), which is what free hosting
 * plans without a background-worker service require.
 */

const POLL_INTERVAL_MS = 15000;
const STATE_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
/** A job stuck in a working state longer than this is treated as abandoned. */
const STALE_JOB_MS = 3 * 60 * 1000;

const WORKING_STATES = [
  JOB_STATUS.SCRIPTING,
  JOB_STATUS.AUDIO_GEN,
  JOB_STATUS.MEDIA_FETCH,
  JOB_STATUS.VIDEO_RENDER,
  JOB_STATUS.READY_TO_UPLOAD,
  JOB_STATUS.UPLOADING
];

let busy = false;
let stopping = false;
let started = false;

export function isWorkerBusy() {
  return busy;
}

export function isWorkerRunning() {
  return started && !stopping;
}

/**
 * Returns jobs abandoned by a crashed or redeployed worker to the queue.
 * Free hosts restart containers frequently, so this matters in practice.
 */
async function requeueStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_JOB_MS).toISOString();
  const snapshot = await db.collection('video_jobs').where('status', 'in', WORKING_STATES).get();

  let requeued = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if ((data.updatedAt || data.createdAt || '') < cutoff) {
      console.warn(`[Worker] Job ${doc.id} travado desde ${data.updatedAt} — devolvendo para a fila.`);
      await doc.ref.set(
        { status: JOB_STATUS.QUEUED, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      requeued++;
    }
  }
  return requeued;
}

/**
 * Claims and runs the oldest queued job.
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

  // Claim transactionally so two workers cannot take the same job
  const claimed = await db.runTransaction(async tx => {
    const fresh = await tx.get(jobDoc.ref);
    if (!fresh.exists || fresh.data().status !== JOB_STATUS.QUEUED) return false;
    tx.set(
      fresh.ref,
      {
        status: JOB_STATUS.SCRIPTING,
        claimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
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
    // executeVideoPipeline already wrote FAILED + errorMessage on the document
    console.error(`[Worker] ✖ Job ${jobDoc.id} falhou: ${err.message}`);
  }

  return true;
}

async function tick() {
  if (busy || stopping) return;
  busy = true;
  try {
    while (!stopping && (await processNextJob())) {
      /* drain the queue before sleeping */
    }
  } catch (err) {
    console.error('[Worker] Erro no ciclo:', err.message);
  } finally {
    busy = false;
  }
}

/**
 * Starts the worker. Safe to call once per process.
 * @returns {Promise<() => void>} a stop function
 */
export async function startWorkerLoop() {
  if (started) {
    console.warn('[Worker] Já iniciado, ignorando segunda chamada.');
    return () => {};
  }
  started = true;

  const requeued = await requeueStaleJobs();
  if (requeued > 0) console.log(`[Worker] ${requeued} job(s) travado(s) devolvido(s) à fila.`);

  // React the instant the dashboard queues something...
  const unsubscribe = db
    .collection('video_jobs')
    .where('status', '==', JOB_STATUS.QUEUED)
    .onSnapshot(
      snapshot => {
        if (!snapshot.empty) tick();
      },
      err => console.error('[Worker] Erro no listener do Firestore:', err.message)
    );

  // ...and poll as a safety net for dropped listeners and reconnects
  const pollTimer = setInterval(tick, POLL_INTERVAL_MS);
  const cleanupTimer = setInterval(() => pruneExpiredStates(), STATE_CLEANUP_INTERVAL_MS);

  await tick();

  console.log('[Worker] Esteira de produção ativa.');

  return function stop() {
    stopping = true;
    clearInterval(pollTimer);
    clearInterval(cleanupTimer);
    unsubscribe();
  };
}
