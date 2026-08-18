import axios from 'axios';

/**
 * Uploads a video to Kwai via Open Platform API adapter.
 */
export async function uploadToKwai({ title, videoUrl, accessToken }) {
  const response = await axios.post(
    'https://open.kwai.com/openapi/video/publish',
    {
      caption: title.slice(0, 100),
      video_url: videoUrl
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return { photoId: response.data?.photo_id || 'kwai_publish_success' };
}
