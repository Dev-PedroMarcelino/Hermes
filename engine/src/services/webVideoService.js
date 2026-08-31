import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const FORBIDDEN_WORDS_REGEX = /\b(anteriores|anterior|antigo|como|olha|veja|isso|quando|porque|sobre|mais|menos|detalhe|curiosidade|historia|evolucao|comparison|compare|previous|history|about|how|why|details|framework|flight|shoes|tenis|logo|banner|icon)\b/gi;

/**
 * Normalizes query string for video search
 */
function cleanQuery(str) {
  return (str || '')
    .replace(FORBIDDEN_WORDS_REGEX, '')
    .replace(/[^\w\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Searches Wikimedia Commons for public domain/creative commons video clips (MP4/WebM).
 */
async function searchWikimediaVideos(query, count = 4) {
  const q = cleanQuery(query);
  if (!q) return [];

  try {
    const url = 'https://commons.wikimedia.org/w/api.php';
    const res = await axios.get(url, {
      params: {
        action: 'query',
        format: 'json',
        generator: 'search',
        gsrsearch: `${q} filetype:video`,
        gsrnamespace: 6,
        gsrlimit: count,
        prop: 'imageinfo',
        iiprop: 'url|mime|thumburl',
        iiurlwidth: 720
      },
      headers: { 'User-Agent': 'HermesContentFactory/2.0 (web-video-collector)' },
      timeout: 8000
    });

    const pages = res.data?.query?.pages || {};
    const videos = [];

    for (const pageId of Object.keys(pages)) {
      const info = pages[pageId]?.imageinfo?.[0];
      if (info?.url && (info.url.endsWith('.mp4') || info.url.endsWith('.webm'))) {
        videos.push({
          id: `wiki_${pageId}`,
          videoUrl: info.url,
          thumbnailUrl: info.thumburl || info.url,
          title: pages[pageId].title?.replace('File:', '') || q,
          source: 'wikimedia'
        });
      }
    }

    return videos;
  } catch (err) {
    console.warn(`[WebVideo] Busca no Wikimedia falhou para "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Searches Pixabay Video API for free open web HD/vertical video clips.
 */
async function searchPixabayVideos(query, pixabayApiKey = null, count = 4) {
  const q = cleanQuery(query);
  if (!q) return [];

  // If no Pixabay key provided, return empty
  if (!pixabayApiKey) return [];

  try {
    const res = await axios.get('https://pixabay.com/api/videos/', {
      params: {
        key: pixabayApiKey,
        q,
        per_page: count,
        safesearch: 'true'
      },
      timeout: 8000
    });

    const hits = res.data?.hits || [];
    return hits.map(hit => {
      const mediumVideo = hit.videos?.medium || hit.videos?.large || hit.videos?.small;
      return {
        id: `pixabay_${hit.id}`,
        videoUrl: mediumVideo?.url,
        thumbnailUrl: hit.userImageURL || `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`,
        duration: hit.duration,
        title: hit.tags || q,
        source: 'pixabay'
      };
    }).filter(v => Boolean(v.videoUrl));
  } catch (err) {
    console.warn(`[WebVideo] Busca no Pixabay falhou para "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Searches Pexels Videos API for vertical portrait video clips.
 */
async function searchPexelsVideos(query, pexelsApiKey = null, count = 6) {
  const q = cleanQuery(query);
  if (!q || !pexelsApiKey) return [];

  try {
    const res = await axios.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: pexelsApiKey },
      params: {
        query: q,
        per_page: count,
        orientation: 'portrait'
      },
      timeout: 9000
    });

    const videos = res.data?.videos || [];
    return videos.map(v => {
      const portraitFiles = (v.video_files || [])
        .filter(f => f.width && f.height && f.height > f.width)
        .sort((a, b) => a.height - b.height);
      const chosenFile = portraitFiles.find(f => f.height >= 1080) || portraitFiles[0] || v.video_files?.[0];

      return {
        id: `pexels_${v.id}`,
        videoUrl: chosenFile?.link,
        thumbnailUrl: v.image,
        duration: v.duration,
        title: q,
        source: 'pexels'
      };
    }).filter(v => Boolean(v.videoUrl));
  } catch (err) {
    console.warn(`[WebVideo] Busca no Pexels falhou para "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Searches real web video candidates from Web/Wikimedia/Pixabay/Pexels for a given scene query.
 *
 * @param {Object} options
 * @param {string} options.query Search terms
 * @param {string} [options.pexelsApiKey]
 * @param {string} [options.pixabayApiKey]
 * @param {number} [options.count=6]
 * @returns {Promise<Array<Object>>} List of candidate video objects
 */
export async function searchWebVideoCandidates({
  query,
  pexelsApiKey = null,
  pixabayApiKey = null,
  count = 6
}) {
  const q = cleanQuery(query);
  if (!q) return [];

  const results = [];

  // 1. First priority: Wikimedia Commons & Open Web Video Repositories
  try {
    const wikiClips = await searchWikimediaVideos(q, 3);
    results.push(...wikiClips);
  } catch (e) {}

  // 2. Second priority: Pixabay Video
  if (pixabayApiKey) {
    try {
      const pixabayClips = await searchPixabayVideos(q, pixabayApiKey, 3);
      results.push(...pixabayClips);
    } catch (e) {}
  }

  // 3. Third priority: Pexels Videos (High Definition Portrait)
  if (pexelsApiKey) {
    try {
      const pexelsClips = await searchPexelsVideos(q, pexelsApiKey, count);
      results.push(...pexelsClips);
    } catch (e) {}
  }

  return results.slice(0, count);
}

/**
 * Downloads a web video file and formats/trims it via FFmpeg into a 9:16 vertical MP4 (1080x1920).
 *
 * @param {Object} options
 * @param {string} options.videoUrl Direct URL of the video
 * @param {string} options.outputPath Local MP4 destination path
 * @param {number} [options.duration=6] Target duration in seconds (≤ 10s)
 * @returns {Promise<string>} Output local path
 */
export async function downloadAndFormatWebVideo({
  videoUrl,
  outputPath,
  duration = 6
}) {
  if (!videoUrl) {
    throw new Error('URL de vídeo não fornecida.');
  }

  await fs.ensureDir(path.dirname(outputPath));
  const rawDownloadPath = `${outputPath}.raw.mp4`;

  // 1. Download stream
  const response = await axios({
    method: 'get',
    url: videoUrl,
    responseType: 'stream',
    timeout: 18000
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(rawDownloadPath);
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        try { response.data.destroy(); } catch (e) {}
        try { writer.destroy(); } catch (e) {}
        fs.remove(rawDownloadPath).catch(() => {});
        reject(new Error('Timeout excedido ao baixar vídeo da Web.'));
      }
    }, 20000);

    writer.on('finish', () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve();
      }
    });

    writer.on('error', err => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        fs.remove(rawDownloadPath).catch(() => {});
        reject(err);
      }
    });

    response.data.pipe(writer);
  });

  // 2. FFmpeg Format Pass: Scale & Crop to 1080x1920 (9:16 Vertical), Trim to duration (<=10s)
  const maxDuration = Math.min(Math.max(duration, 2), 10);
  const ffmpegCmd = `ffmpeg -i "${rawDownloadPath}" -t ${maxDuration} -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -an -y "${outputPath}"`;

  try {
    await execAsync(ffmpegCmd);
    await fs.remove(rawDownloadPath).catch(() => {});
    return outputPath;
  } catch (ffmpegErr) {
    // Clean up temporary raw file
    await fs.remove(rawDownloadPath).catch(() => {});
    throw new Error(`Falha ao formatar vídeo da web com FFmpeg: ${ffmpegErr.message}`);
  }
}
