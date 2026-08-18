import axios from 'axios';

const GRAPH_API = 'https://graph.facebook.com/v20.0';

/**
 * Extends a long-lived Instagram/Facebook token (valid ~60 days).
 */
export async function refreshInstagramToken({ appId, appSecret, accessToken }) {
  if (!appId || !appSecret) {
    throw new Error('INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET ausentes no .env.');
  }

  const response = await axios.get(`${GRAPH_API}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: accessToken
    }
  });

  const expiresIn = response.data.expires_in || 5184000; // 60 days
  return {
    accessToken: response.data.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  };
}

/**
 * Polls a media container until Meta finishes transcoding it.
 *
 * This replaces a fixed 5s sleep: Reels routinely take 30-90s to transcode, and
 * calling media_publish on a container still in IN_PROGRESS fails outright.
 */
async function waitForContainerReady({ creationId, accessToken, timeoutMs = 300000 }) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await axios.get(`${GRAPH_API}/${creationId}`, {
      params: { fields: 'status_code,status', access_token: accessToken }
    });

    const statusCode = response.data.status_code;
    if (statusCode === 'FINISHED') return true;
    if (statusCode === 'ERROR') {
      throw new Error(`Instagram falhou ao processar o vídeo: ${response.data.status || 'erro desconhecido'}`);
    }
    if (statusCode === 'EXPIRED') {
      throw new Error('O container de mídia do Instagram expirou antes da publicação.');
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error('Tempo esgotado aguardando o Instagram processar o Reel.');
}

/**
 * Publishes a Reel to an Instagram Business/Creator account.
 *
 * `videoUrl` must be a publicly reachable HTTPS URL — Meta's servers download
 * the file themselves, so local paths cannot work here.
 *
 * @returns {Promise<{mediaId: string, permalink: string|null}>}
 */
export async function uploadToInstagramReels({ igUserId, caption, videoUrl, accessToken, shareToFeed = true }) {
  if (!videoUrl || !/^https:\/\//i.test(videoUrl)) {
    throw new Error('O Instagram exige uma URL HTTPS pública do vídeo (o arquivo é baixado pelos servidores da Meta).');
  }

  // Step 1: create the REELS container
  let creationId;
  try {
    const containerResponse = await axios.post(`${GRAPH_API}/${igUserId}/media`, null, {
      params: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption: (caption || '').slice(0, 2200),
        share_to_feed: shareToFeed,
        access_token: accessToken
      }
    });
    creationId = containerResponse.data.id;
  } catch (err) {
    const message = err?.response?.data?.error?.message;
    throw new Error(`Instagram (criação do container): ${message || err.message}`);
  }

  // Step 2: wait for Meta to finish transcoding
  await waitForContainerReady({ creationId, accessToken });

  // Step 3: publish
  try {
    const publishResponse = await axios.post(`${GRAPH_API}/${igUserId}/media_publish`, null, {
      params: { creation_id: creationId, access_token: accessToken }
    });

    const mediaId = publishResponse.data.id;

    let permalink = null;
    try {
      const details = await axios.get(`${GRAPH_API}/${mediaId}`, {
        params: { fields: 'permalink', access_token: accessToken }
      });
      permalink = details.data.permalink || null;
    } catch {
      // permalink is a nice-to-have; a failure here does not undo the publish
    }

    return { mediaId, permalink };
  } catch (err) {
    const message = err?.response?.data?.error?.message;
    throw new Error(`Instagram (publicação): ${message || err.message}`);
  }
}
