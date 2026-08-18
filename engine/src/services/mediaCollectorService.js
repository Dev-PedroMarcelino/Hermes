import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

/**
 * Searches and downloads vertical stock video clips from Pexels API.
 * @param {Object} options
 * @param {string} options.query Search query term in English (e.g., 'cyberpunk city')
 * @param {string} options.outputDirPath Target directory to save MP4 files
 * @param {string} options.pexelsApiKey Pexels API key
 * @param {number} options.count Number of clips to download (default: 2)
 * @returns {Promise<Array<string>>} List of downloaded local MP4 file paths
 */
export async function fetchStockVideos({ query, outputDirPath, pexelsApiKey, count = 2 }) {
  if (!fs.existsSync(outputDirPath)) {
    fs.mkdirSync(outputDirPath, { recursive: true });
  }

  const downloadedFiles = [];

  if (!pexelsApiKey) {
    console.warn('[MediaCollector] No Pexels API Key provided. Returning fallback placeholder video.');
    return downloadedFiles;
  }

  try {
    const response = await axios.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: pexelsApiKey },
      params: {
        query: query || 'abstract tech background',
        orientation: 'portrait',
        per_page: count + 3,
        size: 'medium'
      }
    });

    const videos = response.data.videos || [];
    let downloadedCount = 0;

    for (const video of videos) {
      if (downloadedCount >= count) break;

      // Find vertical portrait file link (aspect ratio 9:16 or portrait height > width)
      const videoFile = video.video_files.find(f => f.width && f.height && f.height > f.width) || video.video_files[0];
      if (!videoFile || !videoFile.link) continue;

      const filename = `pexels_${video.id}_${downloadedCount + 1}.mp4`;
      const filePath = path.join(outputDirPath, filename);

      const fileStream = fs.createWriteStream(filePath);
      const videoDownload = await axios({
        method: 'get',
        url: videoFile.link,
        responseType: 'stream'
      });

      await new Promise((resolve, reject) => {
        videoDownload.data.pipe(fileStream);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
      });

      downloadedFiles.push(filePath);
      downloadedCount++;
    }
  } catch (error) {
    console.error(`[MediaCollector] Error fetching video clips from Pexels for query '${query}':`, error.message);
  }

  return downloadedFiles;
}
