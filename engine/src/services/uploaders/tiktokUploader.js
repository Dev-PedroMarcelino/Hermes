import axios from 'axios';

/**
 * Refreshes TikTok Access Token using Refresh Token.
 */
export async function refreshTikTokToken({ clientKey, clientSecret, refreshToken }) {
  const response = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return {
    accessToken: response.data.data.access_token,
    refreshToken: response.data.data.refresh_token,
    expiresAt: new Date(Date.now() + (response.data.data.expires_in || 86400) * 1000).toISOString()
  };
}

/**
 * Initiates video post on TikTok via official Content Posting API.
 */
export async function uploadToTikTok({ title, videoUrl, accessToken }) {
  const response = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      post_info: {
        title: title.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: videoUrl
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return {
    publishId: response.data.data?.publish_id || 'tt_publish_success'
  };
}
