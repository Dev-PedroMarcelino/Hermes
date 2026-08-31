import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { execFile } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Returns the absolute path to the local yt-dlp binary, downloading it if missing.
 */
export async function ensureYtDlpBinary() {
  const binDir = path.resolve('bin');
  await fs.ensureDir(binDir);

  const isWin = process.platform === 'win32';
  const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
  const binaryPath = path.join(binDir, binaryName);

  if (await fs.pathExists(binaryPath)) {
    return binaryPath;
  }

  console.log(`[WebVideo] Baixando binário yt-dlp standalone para ${binaryPath}...`);
  const downloadUrl = isWin
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

  const writer = fs.createWriteStream(binaryPath);
  const response = await axios.get(downloadUrl, { responseType: 'stream' });
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  if (!isWin) {
    await fs.chmod(binaryPath, '755');
  }

  console.log('[WebVideo] yt-dlp pronto para uso.');
  return binaryPath;
}

/**
 * Cleans the query into an effective video search keyword.
 */
function cleanVideoSearchQuery(query) {
  if (!query) return '';
  return query
    .replace(/[^\w\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Searches real web videos metadata (ID, title, thumbnail, embed URL) for UI preview.
 *
 * @param {string} query Search terms
 * @param {number} [maxResults=2]
 * @returns {Promise<Array<Object>>} Video candidate metadata
 */
export async function searchWebVideoMetadata(query, maxResults = 2) {
  const cleanQ = cleanVideoSearchQuery(query);
  if (!cleanQ) return [];

  const ytDlpPath = await ensureYtDlpBinary();
  const args = [
    `ytsearch${maxResults}:${cleanQ} trailer | clip | scene`,
    '--print', '%(id)s|||%(title)s|||%(duration)s|||%(thumbnail)s',
    '--no-warnings',
    '--flat-playlist'
  ];

  try {
    const { stdout } = await execFileAsync(ytDlpPath, args, { timeout: 12000 });
    const lines = stdout.trim().split('\n').filter(Boolean);
    return lines.map(line => {
      const parts = line.split('|||');
      const id = parts[0]?.trim();
      const title = parts[1]?.trim() || cleanQ;
      const duration = parts[2]?.trim() || '10';
      const thumb = parts[3]?.trim();

      if (!id) return null;
      const validThumb = (thumb && thumb !== 'NA' && thumb.startsWith('http'))
        ? thumb
        : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      return {
        id,
        title,
        duration,
        thumbnailUrl: validThumb,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&start=5`,
        videoUrl: `https://www.youtube.com/watch?v=${id}`
      };
    }).filter(Boolean);
  } catch (err) {
    console.warn(`[WebVideo] Busca de prévia de vídeo falhou para "${cleanQ}": ${err.message}`);
    return [];
  }
}

/**
 * Searches and downloads a real web video snippet (≤ 10s) for a specific scene,
 * formatting it with FFmpeg into a vertical 1080x1920 (9:16) MP4 without audio.
 *
 * @param {Object} options
 * @param {string} options.query Search terms (e.g. "Robert Downey Jr Doctor Doom Comic Con reveal")
 * @param {number} [options.duration=8] Duration in seconds (max 10s)
 * @param {string} options.outputPath Target vertical MP4 file path
 * @param {number} [options.startOffset=5] Time offset in seconds to skip static intro logos
 * @returns {Promise<string>} Output vertical MP4 path
 */
export async function downloadRealWebVideoSnippet({
  query,
  duration = 8,
  outputPath,
  startOffset = 5
}) {
  const cleanQ = cleanVideoSearchQuery(query);
  if (!cleanQ) {
    throw new Error('Query vazia para busca de vídeo.');
  }

  const clipDuration = Math.min(Math.max(duration, 3), 10);
  const ytDlpPath = await ensureYtDlpBinary();
  const tempDir = path.join(path.dirname(outputPath), `temp_yt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);
  await fs.ensureDir(tempDir);

  const rawDownloadTemplate = path.join(tempDir, 'raw_snippet.%(ext)s');
  const startSec = Math.max(0, startOffset);
  const endSec = startSec + clipDuration;

  // Search query with video intent
  const searchQuery = `ytsearch1:${cleanQ} clip | trailer | scene`;

  const ytArgs = [
    searchQuery,
    '--download-sections', `*00:00:${String(startSec).padStart(2, '0')}-00:00:${String(endSec).padStart(2, '0')}`,
    '--ffmpeg-location', path.dirname(ffmpegPath),
    '-f', 'bv*[height<=720]+ba/b[height<=720]/best',
    '-o', rawDownloadTemplate,
    '--force-overwrites',
    '--no-playlist',
    '--no-warnings'
  ];

  try {
    console.log(`[WebVideo] Buscando clipe de vídeo real no YouTube: "${searchQuery}" (${clipDuration}s)...`);
    await execFileAsync(ytDlpPath, ytArgs, { timeout: 35000 });

    // Locate the downloaded raw file
    const files = await fs.readdir(tempDir);
    const downloadedRaw = files.find(f => f.startsWith('raw_snippet'));

    if (!downloadedRaw) {
      throw new Error(`Nenhum arquivo baixado pelo yt-dlp para "${cleanQ}".`);
    }

    const rawFilePath = path.join(tempDir, downloadedRaw);

    // Format with FFmpeg into crisp vertical 1080x1920 at 30fps
    console.log(`[WebVideo] Formatando clipe para vertical 1080x1920 (9:16)...`);
    const ffArgs = [
      '-i', rawFilePath,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-an',
      '-t', String(clipDuration),
      '-y',
      outputPath
    ];

    await execFileAsync(ffmpegPath, ffArgs, { timeout: 25000 });
    console.log(`[WebVideo] Vídeo real da Web pronto: ${path.basename(outputPath)} (${clipDuration}s)`);

    return outputPath;
  } finally {
    // Cleanup temporary download folder
    fs.remove(tempDir).catch(() => {});
  }
}
