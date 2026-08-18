import crypto from 'crypto';
import fs from 'fs-extra';
import { db } from '../config/firebase.js';
import { config } from '../config/env.js';
import { uploadVideoToStorage } from './storageService.js';

/**
 * Produces a publicly fetchable HTTPS URL for a rendered video.
 *
 * Instagram's Graph API downloads the file from a URL with its own servers, so
 * a local path is useless to it. There are two ways to satisfy that:
 *
 *  - 'engine' (default): the engine serves the file itself behind an
 *    unguessable, expiring token. Costs nothing — the host already terminates
 *    HTTPS for us.
 *  - 'storage': upload to Firebase Cloud Storage and hand out a signed URL.
 *    Cleaner and survives engine restarts, but Cloud Storage requires the
 *    paid Blaze plan on current Firebase projects.
 *
 * TikTok does not need this at all: it receives the bytes directly through the
 * chunked FILE_UPLOAD flow.
 */

const TOKEN_TTL_MINUTES = 360;

export async function createPublicVideoUrl({ localFilePath, tenantId, jobId }) {
  if (config.publicVideoStrategy === 'storage') {
    const uploaded = await uploadVideoToStorage({ localFilePath, tenantId, jobId });
    return { publicUrl: uploaded.publicUrl, storagePath: uploaded.storagePath, strategy: 'storage' };
  }

  if (!/^https:\/\//i.test(config.enginePublicUrl)) {
    throw new Error(
      `ENGINE_PUBLIC_URL precisa ser HTTPS para o Instagram baixar o vídeo (atual: ${config.enginePublicUrl}).`
    );
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  // The token lives on the job document, so it can be revoked by clearing it
  await db.collection('video_jobs').doc(jobId).set(
    { publicAccess: { token, expiresAt, filePath: localFilePath } },
    { merge: true }
  );

  return {
    publicUrl: `${config.enginePublicUrl}/public/videos/${jobId}/${token}`,
    storagePath: null,
    strategy: 'engine'
  };
}

/**
 * Resolves a public video request to a file on disk.
 * @returns {Promise<{filePath: string}|{error: string, status: number}>}
 */
export async function resolvePublicVideo({ jobId, token }) {
  const snap = await db.collection('video_jobs').doc(jobId).get();
  if (!snap.exists) return { error: 'Job não encontrado.', status: 404 };

  const access = snap.data().publicAccess;
  if (!access?.token) return { error: 'Vídeo não está publicado.', status: 404 };

  // Constant-time compare so the token cannot be guessed byte by byte
  const expected = Buffer.from(access.token);
  const received = Buffer.from(String(token));
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { error: 'Token inválido.', status: 403 };
  }

  if (access.expiresAt && access.expiresAt < new Date().toISOString()) {
    return { error: 'Link expirado.', status: 410 };
  }

  if (!(await fs.pathExists(access.filePath))) {
    return {
      error: 'O arquivo não está mais no disco do motor (o host reinicia com disco efêmero).',
      status: 410
    };
  }

  return { filePath: access.filePath };
}
