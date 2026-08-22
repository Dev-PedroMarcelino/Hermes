import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { generateAiImage, convertImageToMotionClip } from './aiImageService.js';
import { fetchRealGoogleImage } from './googleImageService.js';

/**
 * Helper to query Pexels API with fallback attempts.
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
 * Downloads a video clip from Pexels and saves it locally.
 */
async function downloadPexelsVideo({ video, filePath, matchedQuery }) {
  const portraitFiles = (video.video_files || [])
    .filter(f => f.width && f.height && f.height > f.width)
    .sort((a, b) => a.height - b.height);
  const videoFile =
    portraitFiles.find(f => f.height >= 1280) || portraitFiles[0] || video.video_files?.[0];

  if (!videoFile?.link) {
    throw new Error('Nenhum link de arquivo disponível para o vídeo do Pexels.');
  }

  const download = await axios({
    method: 'get',
    url: videoFile.link,
    responseType: 'stream',
    timeout: 20000
  });

  return new Promise((resolve, reject) => {
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
        resolve(filePath);
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
}

/**
 * Hybrid Scene Media Collector:
 * 1. Google Real Image Search: Downloads real Google images (screenshots, trailers, official art)
 *    and converts them to vertical 9:16 motion clips with Ken Burns camera effect.
 * 2. AI Image Generation (Flux model) + Ken Burns Motion.
 * 3. Pexels Stock Video Fallback.
 *
 * @param {Object} options
 * @param {Array<Object>} [options.sections] Script sections with text, imagePrompt, visualSearchQuery
 * @param {Array<string>} [options.queries] Legacy fallback query strings
 * @param {string} [options.mainVisualTheme] Core theme keywords for fallback search
 * @param {string} [options.mediaTypePreference='google_image'] 'google_image', 'ai_image', or 'stock_video'
 * @param {string} options.outputDirPath Directory to save the MP4s
 * @param {string} options.pexelsApiKey
 * @returns {Promise<Array<string>>} Local paths of the downloaded/generated MP4 clips
 */
export async function fetchStockVideos({
  sections = [],
  queries = [],
  mainVisualTheme = '',
  mediaTypePreference = 'google_image',
  outputDirPath,
  pexelsApiKey
}) {
  await fs.ensureDir(outputDirPath);

  // Normalize input items
  const items = sections.length > 0
    ? sections
    : (queries.length > 0 ? queries.map(q => ({ visualSearchQuery: q })) : [{ visualSearchQuery: mainVisualTheme }]);

  const downloadedFiles = [];
  const usedVideoIds = new Set();
  const usedImageUrls = new Set();

  for (const [index, item] of items.entries()) {
    const imagePrompt = item.imagePrompt || null;
    const visualQuery = item.visualSearchQuery || mainVisualTheme || 'cinematic background';
    const duration = item.durationEstSeconds || 6;

    let sceneClipPath = null;

    // --- Strategy 1: Google Real Image Search + Ken Burns Motion Effect ---
    if (mediaTypePreference === 'google_image' || mediaTypePreference === 'google' || mediaTypePreference === 'real_image') {
      try {
        console.log(`[MediaCollector] Buscando imagem REAL no Google para cena ${index + 1}: "${visualQuery}"`);
        const imgPath = path.join(outputDirPath, `scene_${index}_google.jpg`);
        const videoClipPath = path.join(outputDirPath, `scene_${index}_motion.mp4`);

        await fetchRealGoogleImage({
          query: visualQuery,
          imagePrompt,
          outputPath: imgPath,
          usedUrls: usedImageUrls,
          sceneIndex: index
        });

        await convertImageToMotionClip({
          imagePath: imgPath,
          outputVideoPath: videoClipPath,
          duration,
          motionIndex: index
        });

        sceneClipPath = videoClipPath;
        console.log(`[MediaCollector] Cena ${index + 1} pronta com imagem do Google + Ken Burns: ${path.basename(videoClipPath)}`);
      } catch (googleErr) {
        console.warn(`[MediaCollector] Falha na busca no Google para cena ${index + 1} (${googleErr.message}). Tentando fallback IA/Pexels...`);
      }
    }

    // --- Strategy 2: AI Image Generation (Flux 8K) + Ken Burns Motion Effect ---
    if (!sceneClipPath && imagePrompt && mediaTypePreference !== 'stock_video') {
      try {
        console.log(`[MediaCollector] Gerando cena ${index + 1} com IA (Flux): "${imagePrompt.slice(0, 60)}..."`);
        const imgPath = path.join(outputDirPath, `scene_${index}_art.jpg`);
        const videoClipPath = path.join(outputDirPath, `scene_${index}_motion.mp4`);

        await generateAiImage({
          prompt: imagePrompt,
          outputFilePath: imgPath,
          width: 720,
          height: 1280
        });

        await convertImageToMotionClip({
          imagePath: imgPath,
          outputVideoPath: videoClipPath,
          duration,
          motionIndex: index
        });

        sceneClipPath = videoClipPath;
        console.log(`[MediaCollector] Cena ${index + 1} pronta com IA (Flux) + Ken Burns: ${path.basename(videoClipPath)}`);
      } catch (aiErr) {
        console.warn(`[MediaCollector] Falha na geração por IA para cena ${index + 1} (${aiErr.message}). Tentando fallback Pexels...`);
      }
    }

    // --- Strategy 3: Pexels Stock Video Fallback ---
    if (!sceneClipPath && pexelsApiKey) {
      try {
        const { video, matchedQuery } = await searchPexelsCandidates({
          query: visualQuery,
          mainVisualTheme,
          pexelsApiKey,
          usedVideoIds
        });

        if (video) {
          usedVideoIds.add(video.id);
          const pexelsClipPath = path.join(outputDirPath, `pexels_${index}_${video.id}.mp4`);
          await downloadPexelsVideo({ video, filePath: pexelsClipPath, matchedQuery });
          sceneClipPath = pexelsClipPath;
          console.log(`[MediaCollector] Cena ${index + 1} baixada do Pexels: "${visualQuery}" → ${path.basename(pexelsClipPath)}`);
        }
      } catch (pexelsErr) {
        console.error(`[MediaCollector] Falha no Pexels para cena ${index + 1}:`, pexelsErr.message);
      }
    }

    if (sceneClipPath) {
      downloadedFiles.push(sceneClipPath);
    }
  }

  return downloadedFiles;
}
