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
/**
 * Helper to query Pexels API with fallback attempts (portrait -> any orientation -> mainVisualTheme).
 */
async function searchPexelsCandidates({ query, mainVisualTheme, pexelsApiKey, usedVideoIds }) {
  const attempts = [
    { q: query, orientation: 'portrait' },
    { q: query, orientation: null },
    ...(mainVisualTheme && mainVisualTheme !== query ? [
      { q: mainVisualTheme, orientation: 'portrait' },
      { q: mainVisualTheme, orientation: null }
    ] : [])
  ];

  for (const attempt of attempts) {
    if (!attempt.q || !attempt.q.trim()) continue;
    try {
      const params = {
        query: attempt.q,
        per_page: 10,
        size: 'medium'
      };
      if (attempt.orientation) {
        params.orientation = attempt.orientation;
      }

      const response = await axios.get('https://api.pexels.com/videos/search', {
        headers: { Authorization: pexelsApiKey },
        params,
        timeout: 15000
      });

      const candidates = (response.data?.videos || []).filter(v => !usedVideoIds.has(v.id));
      if (candidates.length > 0) {
        return { video: candidates[0], matchedQuery: attempt.q };
      }
    } catch (err) {
      console.warn(`[MediaCollector] Tentativa no Pexels falhou para "${attempt.q}": ${err.message}`);
    }
  }

  return { video: null, matchedQuery: null };
}

/**
 * Downloads one vertical stock clip per visual query from Pexels.
 *
 * @param {Object} options
 * @param {Array<string>} options.queries English search terms, one per section
 * @param {string} [options.mainVisualTheme] Core theme keywords for fallback search
 * @param {string} options.outputDirPath Directory to save the MP4s
 * @param {string} options.pexelsApiKey
 * @returns {Promise<Array<string>>} Local paths of the downloaded clips
 */
export async function fetchStockVideos({ queries = [], mainVisualTheme = '', outputDirPath, pexelsApiKey }) {
  await fs.ensureDir(outputDirPath);

  if (!pexelsApiKey) {
    console.warn('[MediaCollector] PEXELS_API_KEY ausente — o vídeo usará fundo sólido.');
    return [];
  }

  const downloadedFiles = [];
  const usedVideoIds = new Set();

  for (const [index, query] of queries.entries()) {
    try {
      const { video, matchedQuery } = await searchPexelsCandidates({
        query: query || mainVisualTheme || 'cinematic background',
        mainVisualTheme,
        pexelsApiKey,
        usedVideoIds
      });

      if (!video) {
        console.warn(`[MediaCollector] Nenhum clipe relevante encontrado para "${query}".`);
        continue;
      }

      usedVideoIds.add(video.id);

      // Prefer a genuinely portrait rendition, but accept horizontal (FFmpeg crops/scales to 1080x1920 anyway)
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
        timeout: 20000
      });

      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(filePath);
        let finished = false;

        const streamTimer = setTimeout(() => {
          if (!finished) {
            finished = true;
            try { download.data.destroy(); } catch (e) {}
            try { fileStream.destroy(); } catch (e) {}
            fs.remove(filePath).catch(() => {});
            reject(new Error(`Timeout excedido ao baixar clipe de "${matchedQuery}".`));
          }
        }, 25000);

        download.data.pipe(fileStream);

        fileStream.on('finish', () => {
          if (!finished) {
            finished = true;
            clearTimeout(streamTimer);
            resolve();
          }
        });

        fileStream.on('error', err => {
          if (!finished) {
            finished = true;
            clearTimeout(streamTimer);
            fs.remove(filePath).catch(() => {});
            reject(err);
          }
        });

        download.data.on('error', err => {
          if (!finished) {
            finished = true;
            clearTimeout(streamTimer);
            fs.remove(filePath).catch(() => {});
            reject(err);
          }
        });
      });

      downloadedFiles.push(filePath);
      console.log(`[MediaCollector] "${query}" (usou: "${matchedQuery}") → ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`[MediaCollector] Falha buscando clipe ${index + 1}:`, error.message);
    }
  }

  return downloadedFiles;
}
