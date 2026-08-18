import path from 'path';
import { storage } from '../config/firebase.js';
import { config } from '../config/env.js';

/**
 * TikTok and Instagram never receive the video bytes from us directly — their
 * APIs fetch the file themselves over HTTPS. A local `file://` path is therefore
 * useless to them. We publish the rendered MP4 to Firebase Storage and hand the
 * platforms a time-limited signed URL instead.
 *
 * @param {Object} options
 * @param {string} options.localFilePath Absolute path to the rendered MP4
 * @param {string} options.tenantId Tenant that owns the video
 * @param {string} options.jobId Job the video belongs to
 * @param {number} [options.expiresInMinutes] Signed URL lifetime (default 6h)
 * @returns {Promise<{publicUrl: string, storagePath: string, expiresAt: string}>}
 */
export async function uploadVideoToStorage({
  localFilePath,
  tenantId,
  jobId,
  expiresInMinutes = 360
}) {
  if (!config.firebase.storageBucket) {
    throw new Error(
      'FIREBASE_STORAGE_BUCKET não configurado no .env. TikTok e Instagram precisam de uma URL HTTPS pública do vídeo.'
    );
  }

  const bucket = storage.bucket(config.firebase.storageBucket);
  const storagePath = `renders/${tenantId}/${jobId}/${path.basename(localFilePath)}`;

  await bucket.upload(localFilePath, {
    destination: storagePath,
    metadata: {
      contentType: 'video/mp4',
      cacheControl: 'public, max-age=3600'
    }
  });

  const expiresAtMs = Date.now() + expiresInMinutes * 60 * 1000;
  const [publicUrl] = await bucket.file(storagePath).getSignedUrl({
    action: 'read',
    expires: expiresAtMs
  });

  return {
    publicUrl,
    storagePath,
    expiresAt: new Date(expiresAtMs).toISOString()
  };
}

/**
 * Removes a rendered video from Storage (used by the cascade delete flow).
 */
export async function deleteVideoFromStorage(storagePath) {
  if (!storagePath || !config.firebase.storageBucket) return false;
  try {
    await storage.bucket(config.firebase.storageBucket).file(storagePath).delete();
    return true;
  } catch (err) {
    console.warn(`[Storage] Não foi possível apagar ${storagePath}:`, err.message);
    return false;
  }
}
