import axios from 'axios';
import fs from 'fs-extra';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

/**
 * Refreshes a TikTok access token. TikTok access tokens live ~24h, so this runs
 * before essentially every publish.
 */
export async function refreshTikTokToken({ clientKey, clientSecret, refreshToken }) {
  const response = await axios.post(
    `${TIKTOK_API}/oauth/token/`,
    new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const data = response.data;
  if (data.error) {
    throw new Error(`TikTok refresh: ${data.error_description || data.error}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000).toISOString()
  };
}

/**
 * Reads the account's posting capabilities. Unaudited apps get
 * `privacy_level_options` limited to SELF_ONLY — attempting PUBLIC_TO_EVERYONE
 * in that state fails, so we ask first instead of guessing.
 */
export async function getTikTokCreatorInfo({ accessToken }) {
  const response = await axios.post(
    `${TIKTOK_API}/post/publish/creator_info/query/`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }
  );

  if (response.data.error?.code && response.data.error.code !== 'ok') {
    throw new Error(`TikTok creator_info: ${response.data.error.message}`);
  }
  return response.data.data;
}

/**
 * Publishes a video to TikTok using the direct FILE_UPLOAD flow.
 *
 * We deliberately avoid PULL_FROM_URL: it requires the video host domain to be
 * verified inside the TikTok developer console, which a Firebase Storage signed
 * URL cannot satisfy. FILE_UPLOAD sends the bytes ourselves and needs no domain
 * verification.
 *
 * @returns {Promise<{publishId: string, privacyLevel: string}>}
 */
export async function uploadToTikTok({ videoPath, title, accessToken, privacyLevel }) {
  if (!(await fs.pathExists(videoPath))) {
    throw new Error(`Arquivo de vídeo não encontrado: ${videoPath}`);
  }

  const { size: videoSize } = await fs.stat(videoPath);
  if (videoSize === 0) throw new Error('Arquivo de vídeo está vazio.');

  // Pick a privacy level the account is actually allowed to use
  let effectivePrivacy = privacyLevel;
  try {
    const creatorInfo = await getTikTokCreatorInfo({ accessToken });
    const allowed = creatorInfo?.privacy_level_options || [];
    if (!effectivePrivacy || !allowed.includes(effectivePrivacy)) {
      effectivePrivacy = allowed.includes('PUBLIC_TO_EVERYONE')
        ? 'PUBLIC_TO_EVERYONE'
        : allowed[0] || 'SELF_ONLY';
    }
  } catch (err) {
    console.warn('[TikTok] creator_info indisponível, usando SELF_ONLY:', err.message);
    effectivePrivacy = effectivePrivacy || 'SELF_ONLY';
  }

  // TikTok requires chunks of at least 5MB (except a single whole-file chunk)
  const MIN_CHUNK = 5 * 1024 * 1024;
  const useSingleChunk = videoSize <= 64 * 1024 * 1024;
  const chunkSize = useSingleChunk ? videoSize : MIN_CHUNK;
  const totalChunkCount = useSingleChunk ? 1 : Math.floor(videoSize / chunkSize);

  // Step 1: initialize the upload session
  const initResponse = await axios.post(
    `${TIKTOK_API}/post/publish/video/init/`,
    {
      post_info: {
        title: (title || '').slice(0, 2200),
        privacy_level: effectivePrivacy,
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
        video_cover_timestamp_ms: 1000
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }
  );

  if (initResponse.data.error?.code && initResponse.data.error.code !== 'ok') {
    throw new Error(`TikTok init: ${initResponse.data.error.message}`);
  }

  const { publish_id: publishId, upload_url: uploadUrl } = initResponse.data.data;

  // Step 2: PUT the bytes chunk by chunk
  for (let index = 0; index < totalChunkCount; index++) {
    const start = index * chunkSize;
    // The final chunk absorbs any remainder bytes
    const end = index === totalChunkCount - 1 ? videoSize - 1 : start + chunkSize - 1;
    const chunkBuffer = Buffer.alloc(end - start + 1);

    const fd = await fs.open(videoPath, 'r');
    try {
      await fs.read(fd, chunkBuffer, 0, chunkBuffer.length, start);
    } finally {
      await fs.close(fd);
    }

    await axios.put(uploadUrl, chunkBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': chunkBuffer.length,
        'Content-Range': `bytes ${start}-${end}/${videoSize}`
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
  }

  return { publishId, privacyLevel: effectivePrivacy };
}

/**
 * Polls TikTok until the uploaded video finishes server-side processing.
 */
export async function waitForTikTokPublish({ publishId, accessToken, timeoutMs = 180000 }) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await axios.post(
      `${TIKTOK_API}/post/publish/status/fetch/`,
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );

    const data = response.data.data || {};
    if (data.status === 'PUBLISH_COMPLETE') {
      return { status: 'PUBLISH_COMPLETE', publiclyAvailablePostId: data.publicaly_available_post_id?.[0] || null };
    }
    if (data.status === 'FAILED') {
      throw new Error(`TikTok falhou ao processar o vídeo: ${data.fail_reason || 'motivo desconhecido'}`);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error('Tempo esgotado aguardando o TikTok processar o vídeo.');
}
