import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/env.js';

// Expanded blacklist: blocks covers, posters, logos, box arts, collages, old franchise iterations, watermark stock, fanart, etc.
const BLOCKED_URL_PATTERNS = [
  /freepik\./i,
  /vecteezy\./i,
  /shutterstock\./i,
  /alamy\./i,
  /istockphoto\./i,
  /dreamstime\./i,
  /deviantart\./i,
  /pinterest\./i,
  /pinimg\./i,
  /cosplay/i,
  /action[-_]?figure/i,
  /toy/i,
  /meme/i,
  /clipart/i,
  /sketch/i,
  /drawing/i,
  /caricature/i,
  /watermark/i,
  /hotel/i,
  /resort/i,
  /airbnb/i,
  /realestate/i,
  /furniture/i,
  /fireplace/i,
  /icon[-_]?\d+/i,
  /logo/i,
  /cover/i,
  /box[-_]?art/i,
  /boxart/i,
  /packshot/i,
  /poster/i,
  /collage/i,
  /grid/i,
  /gta[-_]?online/i,
  /gta[-_]?v\b/i,
  /gta5\b/i,
  /grand[-_]?theft[-_]?auto[-_]?v\b/i,
  /dvd/i,
  /bluray/i,
  /\.svg$/i,
  /\.gif$/i
];

function isGoodImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 15) return false;
  return !BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Searches and downloads 100% REAL clean in-game/movie capture stills from the web (Google / Bing / Wikimedia).
 * Enforces negative exclusion operators to prevent covers, posters, collages, and old iterations.
 *
 * @param {Object} options
 * @param {string} options.query Clean search query (e.g., "GTA 6 Lucia Vice City car chase trailer still")
 * @param {string} options.outputPath Local file path to save the image (.jpg)
 * @param {Set<string>} [options.usedUrls] Set of image URLs already downloaded in this job
 * @returns {Promise<string>} Path to saved real clean capture
 */
export async function fetchRealGoogleImage({ query, outputPath, usedUrls = new Set() }) {
  await fs.ensureDir(path.dirname(outputPath));

  const apiKey = config.googleSearchApiKey;
  const cx = config.googleSearchCx;

  // Clean and prepare query, removing any remaining forbidden keywords
  const cleanQuery = query
    .replace(/\b(poster|cover|boxart|box\s*art|logo|wallpaper|wallpapers|art|promo)\b/gi, '')
    .replace(/[^\w\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(
    `${cleanQuery} trailer still gameplay screenshot -cover -poster -logo -boxart -collage -grid -online -"gta 5" -"gta v" -gtav -gta5 -fanart -cosplay -drawing -sketch -toy -meme -hotel -room`
  )}&form=HDRSC2&first=1&qft=+filterui:imagesize-large+filterui:aspect-wide`;

  // --- Strategy 1: High-Speed Web Image Search with Forced Exclusion Operators ---
  try {
    const res = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 6000
    });

    const matches = [...res.data.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)].map(m => m[1]);
    for (const imgUrl of matches.slice(0, 12)) {
      if (imgUrl && !usedUrls.has(imgUrl) && isGoodImageUrl(imgUrl)) {
        usedUrls.add(imgUrl);
        const saved = await downloadImage(imgUrl, outputPath);
        if (saved) {
          console.log(`[GoogleImage] Captura limpa HD baixada para "${cleanQuery}": ${path.basename(imgUrl)}`);
          return saved;
        }
      }
    }
  } catch (err) {
    console.warn(`[GoogleImage] Busca rápida falhou para "${cleanQuery}": ${err.message}`);
  }

  // --- Strategy 2: Official Google Custom Search JSON API (if configured) ---
  if (apiKey && cx) {
    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: apiKey,
          cx: cx,
          q: `${cleanQuery} -cover -poster -logo -boxart -collage -grid -online -"gta 5" -"gta v" -fanart -cosplay`,
          searchType: 'image',
          imgSize: 'LARGE',
          imgType: 'photo',
          num: 10
        },
        timeout: 6000
      });

      const items = response.data?.items || [];
      for (const item of items) {
        if (item.link && !usedUrls.has(item.link) && isGoodImageUrl(item.link)) {
          usedUrls.add(item.link);
          const saved = await downloadImage(item.link, outputPath);
          if (saved) return saved;
        }
      }
    } catch (err) {}
  }

  // --- Strategy 3: Wikimedia Commons High-Res API Fallback ---
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&prop=pageimages&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=10&piprop=thumbnail&pithumbsize=1280&format=json`;
    const response = await axios.get(wikiUrl, { timeout: 5000 });
    const pages = response.data?.query?.pages || {};
    for (const pageId in pages) {
      const imgUrl = pages[pageId]?.thumbnail?.source;
      if (imgUrl && !usedUrls.has(imgUrl) && isGoodImageUrl(imgUrl)) {
        usedUrls.add(imgUrl);
        const saved = await downloadImage(imgUrl, outputPath);
        if (saved) return saved;
      }
    }
  } catch (err) {}

  throw new Error(`Nenhuma captura de cena limpa encontrada para: "${query}"`);
}

/**
 * Fast stream downloader with quality check.
 */
async function downloadImage(url, outputPath) {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    return new Promise((resolve) => {
      const fileStream = fs.createWriteStream(outputPath);
      let finished = false;

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { response.data.destroy(); } catch (e) {}
          try { fileStream.destroy(); } catch (e) {}
          fs.remove(outputPath).catch(() => {});
          resolve(null);
        }
      }, 7000);

      response.data.pipe(fileStream);

      fileStream.on('finish', async () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          const exists = await fs.pathExists(outputPath);
          if (exists) {
            const { size } = await fs.stat(outputPath);
            if (size > 25000) {
              return resolve(outputPath);
            }
          }
          fs.remove(outputPath).catch(() => {});
          resolve(null);
        }
      });

      fileStream.on('error', () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          fs.remove(outputPath).catch(() => {});
          resolve(null);
        }
      });
    });
  } catch (e) {
    return null;
  }
}
