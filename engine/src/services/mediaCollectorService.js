import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

/**
 * Downloads one vertical stock clip per visual query from Pexels.
 *
 * One clip per script section keeps the background changing through the video;
 * the previous single-query version made every short look identical.
 *
 * @param {Object} options
 * @param {Array<string>} options.queries English search terms, one per section
 * @param {string} options.outputDirPath Directory to save the MP4s
 * @param {string} options.pexelsApiKey
 * @returns {Promise<Array<string>>} Local paths of the downloaded clips
 */
export async function fetchStockVideos({ queries = [], outputDirPath, pexelsApiKey }) {
  await fs.ensureDir(outputDirPath);

  if (!pexelsApiKey) {
    console.warn('[MediaCollector] PEXELS_API_KEY ausente — o vídeo usará fundo sólido.');
    return [];
  }

  const downloadedFiles = [];
  const usedVideoIds = new Set();

  for (const [index, query] of queries.entries()) {
    try {
      const response = await axios.get('https://api.pexels.com/videos/search', {
        headers: { Authorization: pexelsApiKey },
        params: {
          query: query || 'abstract technology background',
          orientation: 'portrait',
          per_page: 8,
          size: 'medium'
        },
        timeout: 20000
      });

      const candidates = (response.data.videos || []).filter(v => !usedVideoIds.has(v.id));
      if (candidates.length === 0) {
        console.warn(`[MediaCollector] Nenhum clipe novo para "${query}".`);
        continue;
      }

      const video = candidates[0];
      usedVideoIds.add(video.id);

      // Prefer a genuinely portrait rendition, and cap resolution so the
      // download stays fast — we downscale to 1080x1920 anyway.
      const portraitFiles = (video.video_files || [])
        .filter(f => f.width && f.height && f.height > f.width)
        .sort((a, b) => a.height - b.height);
      const videoFile =
        portraitFiles.find(f => f.height >= 1280) || portraitFiles[0] || video.video_files?.[0];

      if (!videoFile?.link) continue;

      const filePath = path.join(outputDirPath, `pexels_${index}_${video.id}.mp4`);
      const download = await axios({
        method: 'get',
        url: videoFile.link,
        responseType: 'stream',
        timeout: 120000
      });

      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        download.data.pipe(fileStream);
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
        download.data.on('error', reject);
      });

      downloadedFiles.push(filePath);
      console.log(`[MediaCollector] "${query}" → ${path.basename(filePath)}`);
    } catch (error) {
      // A missing background clip degrades the video but must not kill the job
      console.error(`[MediaCollector] Falha buscando "${query}":`, error.message);
    }
  }

  return downloadedFiles;
}
