import fs from 'fs-extra';
import { google } from 'googleapis';

/**
 * Builds an authenticated YouTube client. googleapis refreshes the access token
 * automatically from the refresh token, so callers only need to persist the
 * refresh token long-term.
 */
function buildYouTubeClient({ clientId, clientSecret, refreshToken, accessToken }) {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken || undefined
  });
  return { youtube: google.youtube({ version: 'v3', auth: oauth2Client }), oauth2Client };
}

/**
 * Refreshes a YouTube OAuth2 access token from the stored refresh token.
 */
export async function refreshYouTubeToken({ clientId, clientSecret, refreshToken }) {
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  return {
    accessToken: credentials.access_token,
    expiresAt: credentials.expiry_date
      ? new Date(credentials.expiry_date).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString()
  };
}

/**
 * Uploads a vertical video to YouTube as a Short.
 *
 * Note on `privacyStatus`: until the Google Cloud project passes OAuth
 * verification for the youtube.upload scope, YouTube force-locks every upload
 * from the app to `private` regardless of what is requested here.
 *
 * @returns {Promise<{videoId: string, videoUrl: string, privacyStatus: string}>}
 */
export async function uploadToYouTubeShorts({
  videoPath,
  title,
  description = '',
  tags = [],
  categoryId = '28',
  privacyStatus = 'public',
  clientId,
  clientSecret,
  refreshToken,
  accessToken
}) {
  if (!(await fs.pathExists(videoPath))) {
    throw new Error(`Arquivo de vídeo não encontrado: ${videoPath}`);
  }

  const { size } = await fs.stat(videoPath);
  if (size === 0) throw new Error(`Arquivo de vídeo está vazio: ${videoPath}`);

  // The #Shorts tag is what makes YouTube classify a vertical <60s video as a Short
  const formattedTitle = /#shorts/i.test(title) ? title : `${title} #Shorts`;

  const { youtube } = buildYouTubeClient({ clientId, clientSecret, refreshToken, accessToken });

  try {
    const response = await youtube.videos.insert(
      {
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: formattedTitle.slice(0, 100),
            description: description.slice(0, 5000),
            tags: tags.slice(0, 15),
            categoryId
          },
          status: {
            privacyStatus,
            selfDeclaredMadeForKids: false
          }
        },
        media: { body: fs.createReadStream(videoPath) }
      },
      // Resumable upload so large files survive transient network drops
      { maxContentLength: Infinity, maxBodyLength: Infinity }
    );

    const videoId = response.data?.id;
    if (!videoId) {
      throw new Error('A API do YouTube não retornou um ID de vídeo.');
    }

    return {
      videoId,
      videoUrl: `https://www.youtube.com/shorts/${videoId}`,
      privacyStatus: response.data.status?.privacyStatus || privacyStatus
    };
  } catch (err) {
    const apiError = err?.response?.data?.error;
    const reason = apiError?.errors?.[0]?.reason;

    if (reason === 'quotaExceeded') {
      throw new Error(
        'Cota diária da YouTube Data API esgotada. Cada upload custa 1600 unidades do limite padrão de 10.000/dia (~6 vídeos).'
      );
    }
    if (reason === 'youtubeSignupRequired') {
      throw new Error('A conta Google autenticada não possui um canal do YouTube ativo.');
    }
    if (apiError?.message) {
      throw new Error(`YouTube API: ${apiError.message}`);
    }
    throw err;
  }
}
