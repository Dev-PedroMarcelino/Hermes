import axios from 'axios';

/**
 * Extends or Refreshes Long-Lived Instagram Graph API Token.
 */
export async function refreshInstagramToken({ clientSecret, accessToken }) {
  const response = await axios.get('https://graph.facebook.com/v20.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: 'INSTAGRAM_APP_ID',
      client_secret: clientSecret,
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
 * Uploads a video to Instagram Reels via Graph API.
 * Step 1: Create REELS Media Container
 * Step 2: Poll Container Status until READY
 * Step 3: Publish Media Container
 */
export async function uploadToInstagramReels({ igUserId, caption, videoUrl, accessToken }) {
  // Step 1: Create Container
  const containerResponse = await axios.post(`https://graph.facebook.com/v20.0/${igUserId}/media`, null, {
    params: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption,
      access_token: accessToken
    }
  });

  const creationId = containerResponse.data.id;

  // Step 2: Publish Container (Wait briefly for Meta container processing)
  await new Promise(res => setTimeout(res, 5000));

  const publishResponse = await axios.post(`https://graph.facebook.com/v20.0/${igUserId}/media_publish`, null, {
    params: {
      creation_id: creationId,
      access_token: accessToken
    }
  });

  return { mediaId: publishResponse.data.id };
}
