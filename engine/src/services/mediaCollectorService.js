import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { convertImageToMotionClip } from './aiImageService.js';
import { fetchRealGoogleImage } from './googleImageService.js';
import { searchWebVideoCandidates, downloadAndFormatWebVideo } from './webVideoService.js';

// Abstract words, transitional phrases or fillers that ruin image searches
const FORBIDDEN_WORDS_REGEX = /\b(anteriores|anterior|antigo|como|olha|veja|isso|quando|porque|sobre|mais|menos|detalhe|curiosidade|historia|evolucao|comparison|compare|previous|history|about|how|why|details|framework|flight|shoes|tenis|logo|banner|icon)\b/gi;

/**
 * Combines theme and scene query cleanly into a concrete physical search term.
 */
function buildConcreteSceneQuery(mainTheme = '', sceneQuery = '', sceneIndex = 0) {
  const cleanMain = (mainTheme || '').replace(FORBIDDEN_WORDS_REGEX, '').replace(/[^\w\s-]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cleanScene = (sceneQuery || '').replace(FORBIDDEN_WORDS_REGEX, '').replace(/[^\w\s-]/gi, ' ').replace(/\s+/g, ' ').trim();

  // If the scene query has valid specific words, combine them with main theme
  if (cleanScene && cleanScene.length > 2) {
    const mainWords = cleanMain.split(/\s+/).filter(Boolean);
    const sceneWords = cleanScene.split(/\s+/).filter(Boolean);
    const combined = [...mainWords];

    for (const word of sceneWords) {
      if (!combined.some(existing => existing.toLowerCase() === word.toLowerCase())) {
        combined.push(word);
      }
    }
    return combined.join(' ');
  }

  // Fallback to structured per-scene visual angles
  const theme = cleanMain || 'Technology';
  const defaultAngles = [
    theme,
    `${theme} main characters`,
    `${theme} landscape scenery`,
    `${theme} action scene`,
    `${theme} trailer screenshot`
  ];

  return defaultAngles[sceneIndex % defaultAngles.length];
}

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
        timeout: 10000
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
    timeout: 15000
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
    }, 18000);

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
 * Real Media Collector:
 * Collects real web videos (≤10s) or real web photos with Ken Burns motion.
 *
 * @param {Object} options
 * @param {Array<Object>} [options.sections] Script sections with text, visualSearchQuery
 * @param {Array<string>} [options.queries] Legacy fallback query strings
 * @param {string} [options.mainVisualTheme] Core theme keywords for fallback search
 * @param {string} [options.mediaTypePreference='web_video'] 'web_video' | 'stock_video' | 'google_image'
 * @param {string} options.outputDirPath Directory to save the MP4s
 * @param {string} options.pexelsApiKey
 * @returns {Promise<Array<string>>} Local paths of the generated 9:16 MP4 video clips
 */
export async function fetchStockVideos({
  sections = [],
  queries = [],
  mainVisualTheme = '',
  mediaTypePreference = 'web_video',
  outputDirPath,
  pexelsApiKey,
  geminiApiKey = null,
  serperApiKey = null
}) {
  await fs.ensureDir(outputDirPath);

  // Normalize input items
  const items = sections.length > 0
    ? sections
    : (queries.length > 0 ? queries.map(q => ({ visualSearchQuery: q })) : [{ visualSearchQuery: mainVisualTheme }]);

  const downloadedFiles = [];
  const usedVideoIds = new Set();
  const usedImageUrls = new Set();
  let lastSuccessfulClip = null;

  const preferWebVideos = mediaTypePreference === 'web_video' || mediaTypePreference === 'stock_video';

  for (const [index, item] of items.entries()) {
    const rawVisualQuery = (item.visualSearchQuery || '').trim();
    const mainTheme = (mainVisualTheme || '').trim();

    // Clean, concrete query anchored to the topic
    const concreteQuery = buildConcreteSceneQuery(mainTheme, rawVisualQuery, index);
    const duration = Math.min(item.durationEstSeconds || 6, 10);
    let sceneClipPath = null;

    // --- Strategy 1: Real Web Videos (Open Web / Wikimedia / Pixabay / Pexels ≤10s) ---
    if (preferWebVideos) {
      try {
        console.log(`[MediaCollector] Buscando vídeo real curto na Web para cena ${index + 1}: "${concreteQuery}"`);
        const candidates = await searchWebVideoCandidates({
          query: concreteQuery,
          pexelsApiKey,
          count: 5
        });

        const chosenCandidate = candidates.find(c => !usedVideoIds.has(c.id || c.videoUrl)) || candidates[0];

        if (chosenCandidate?.videoUrl) {
          usedVideoIds.add(chosenCandidate.id || chosenCandidate.videoUrl);
          const webClipPath = path.join(outputDirPath, `web_video_${index}.mp4`);
          await downloadAndFormatWebVideo({
            videoUrl: chosenCandidate.videoUrl,
            outputPath: webClipPath,
            duration
          });

          sceneClipPath = webClipPath;
          lastSuccessfulClip = webClipPath;
          console.log(`[MediaCollector] Cena ${index + 1} pronta com VÍDEO REAL DA WEB: ${path.basename(webClipPath)}`);
        }
      } catch (webVideoErr) {
        console.warn(`[MediaCollector] Falha ao coletar vídeo da web para cena ${index + 1} (${webVideoErr.message}). Tentando foto real...`);
      }
    }

    // --- Strategy 2: Direct Google / Bing Real Image Search (Vision Audited + Ken Burns Motion) ---
    // Enforces fast dynamic cuts of 2.5 - 3.0s max per image
    if (!sceneClipPath) {
      const numSubCuts = duration > 3.2 ? Math.ceil(duration / 2.8) : 1;
      const subDuration = duration / numSubCuts;
      const subClips = [];

      for (let subIdx = 0; subIdx < numSubCuts; subIdx++) {
        const subQuery = subIdx === 0
          ? concreteQuery
          : `${mainTheme} ${subIdx % 2 === 0 ? 'closeup character action' : 'cinematic scene 4k'}`.trim();

        const searchAttempts = [
          subQuery,
          concreteQuery,
          mainTheme || null
        ].filter(Boolean);

        let subClipCreated = null;

        for (const queryToTry of searchAttempts) {
          try {
            console.log(`[MediaCollector] Buscando foto real no Google para corte ${index + 1}.${subIdx + 1} (${subDuration.toFixed(1)}s): "${queryToTry}"`);
            const imgPath = path.join(outputDirPath, `scene_${index}_sub_${subIdx}_real.jpg`);
            const videoClipPath = path.join(outputDirPath, `scene_${index}_sub_${subIdx}_motion.mp4`);

            await fetchRealGoogleImage({
              query: queryToTry,
              outputPath: imgPath,
              usedUrls: usedImageUrls,
              serperApiKey
            });

            await convertImageToMotionClip({
              imagePath: imgPath,
              outputVideoPath: videoClipPath,
              duration: subDuration,
              motionIndex: (index * 2) + subIdx
            });

            subClipCreated = videoClipPath;
            lastSuccessfulClip = videoClipPath;
            console.log(`[MediaCollector] Corte ${index + 1}.${subIdx + 1} pronto (${subDuration.toFixed(1)}s): ${path.basename(videoClipPath)}`);
            break;
          } catch (googleErr) {
            console.warn(`[MediaCollector] Tentativa foto real para "${queryToTry}" falhou: ${googleErr.message}`);
          }
        }

        if (subClipCreated) {
          subClips.push(subClipCreated);
        } else if (lastSuccessfulClip) {
          subClips.push(lastSuccessfulClip);
        }
      }

      if (subClips.length > 0) {
        downloadedFiles.push(...subClips);
        continue;
      }
    }

    // --- Strategy 3: Previous Scene Clip Fallback (Guarantees zero stall) ---
    if (!sceneClipPath && lastSuccessfulClip) {
      sceneClipPath = lastSuccessfulClip;
      console.log(`[MediaCollector] Cena ${index + 1} utilizando clipe da cena anterior.`);
    }

    if (sceneClipPath) {
      downloadedFiles.push(sceneClipPath);
    }
  }

  return downloadedFiles;
}
