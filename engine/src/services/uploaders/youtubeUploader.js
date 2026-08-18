import axios from 'axios';
import fs from 'fs-extra';

/**
 * Refreshes YouTube OAuth2 Access Token using Refresh Token.
 * @param {Object} options
 * @param {string} clientId OAuth Client ID
 * @param {string} clientSecret OAuth Client Secret
 * @param {string} refreshToken Refresh Token
 * @returns {Promise<{accessToken: string, expiresAt: string}>}
 */
export async function refreshYouTubeToken({ clientId, clientSecret, refreshToken }) {
  const url = 'https://oauth2.googleapis.com/token';
  const response = await axios.post(url, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const accessToken = response.data.access_token;
  const expiresIn = response.data.expires_in || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return { accessToken, expiresAt };
}

/**
 * Uploads a short video to YouTube Shorts using Resumable Upload protocol.
 * @param {Object} options
 * @param {string} options.videoPath Local path to MP4 video
 * @param {string} options.title Video Title (includes #Shorts tag)
 * @param {string} options.description Video Description with hashtags
 * @param {Array<string>} options.tags Tags
 * @param {string} options.accessToken YouTube OAuth2 Access Token
 * @returns {Promise<{videoId: string, videoUrl: string}>}
 */
export async function uploadToYouTubeShorts({
  videoPath,
  title,
  description = '',
  tags = [],
  accessToken
}) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found at path: ${videoPath}`);
  }

  const fileSize = (await fs.stat(videoPath)).size;

  // Add #Shorts to title if missing
  const formattedTitle = title.includes('#Shorts') || title.includes('#shorts')
    ? title
    : `${title} #Shorts`;

  // Step 1: Initiate Resumable Upload Session
  const initResponse = await axios.post(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      snippet: {
        title: formattedTitle.slice(0, 100),
        description: description,
        tags: tags,
        categoryId: '28' // Technology
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': fileSize,
        'X-Upload-Content-Type': 'video/mp4'
      }
    }
  );

  const uploadUrl = initResponse.headers.location;

  // Step 2: Upload Video File Stream
  const videoStream = fs.createReadStream(videoPath);
  const uploadResponse = await axios.put(uploadUrl, videoStream, {
    headers: {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    }
  });

  const videoId = uploadResponse.data.id;
  const videoUrl = `https://youtube.com/shorts/${videoId}`;

  return { videoId, videoUrl };
}
