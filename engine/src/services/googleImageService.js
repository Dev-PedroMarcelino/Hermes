import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/env.js';

// Block domains and URLs known for watermark, fanart, toys, or low-res junk
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
  /icon[-_]?\d+/i,
  /logo/i,
  /\.svg$/i,
  /\.gif$/i
];

function isGoodImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 15) return false;
  return !BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Searches and downloads 100% REAL images from the web (Google / Bing / Wikimedia).
 * Filters out low-res thumbnails, watermarks, fan-art, and unrelated content.
 *
 * @param {Object} options
 * @param {string} options.query Search query (e.g., "GTA 6 Lucia Vice City screenshot")
 * @param {string} options.outputPath Local file path to save the image (.jpg)
 * @param {Set<string>} [options.usedUrls] Set of image URLs already downloaded in this job
 * @param {number} [options.sceneIndex=0] Index of the scene
 * @returns {Promise<string>} Path to saved real image
 */
export async function fetchRealGoogleImage({ query, outputPath, usedUrls = new Set(), sceneIndex = 0 }) {
  await fs.ensureDir(path.dirname(outputPath));

  const apiKey = config.googleSearchApiKey;
  const cx = config.googleSearchCx;

  // Add high quality qualifiers and negative search terms
  const searchTerms = [
    `${query} official 4k wallpaper cinematic HD`,
    `${query} movie still 1080p`,
    `${query} official screenshot 4k`,
    query
  ];

  for (const q of searchTerms) {
    // --- Strategy 1: Official Google Custom Search JSON API ---
    if (apiKey && cx) {
      try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: {
            key: apiKey,
            cx: cx,
            q: `${q} -fanart -cosplay -drawing -toy`,
            searchType: 'image',
            imgSize: 'LARGE',
            imgType: 'photo',
            num: 10
          },
          timeout: 10000
        });

        const items = response.data?.items || [];
        for (const item of items) {
          if (item.link && !usedUrls.has(item.link) && isGoodImageUrl(item.link)) {
            usedUrls.add(item.link);
            const saved = await downloadImage(item.link, outputPath);
            if (saved) {
              console.log(`[GoogleImage] Foto oficial baixada via Google API para "${q}"`);
              return saved;
            }
          }
        }
      } catch (err) {
        console.warn(`[GoogleImage] Falha na busca Google API para "${q}": ${err.message}`);
      }
    }

    // --- Strategy 2: High-Definition Web Image Search (Real screenshots / photos) ---
    try {
      const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(`${q} -fanart -cosplay -drawing -sketch -toy -meme`)}&form=HDRSC2&first=1&qft=+filterui:imagesize-large`;
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        timeout: 10000
      });

      const matches = [...res.data.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)].map(m => m[1]);
      for (const imgUrl of matches) {
        if (imgUrl && !usedUrls.has(imgUrl) && isGoodImageUrl(imgUrl)) {
          usedUrls.add(imgUrl);
          const saved = await downloadImage(imgUrl, outputPath);
          if (saved) {
            console.log(`[GoogleImage] Foto oficial HD baixada da web para "${q}": ${path.basename(imgUrl)}`);
            return saved;
          }
        }
      }
    } catch (err) {
      console.warn(`[GoogleImage] Falha na busca web para "${q}": ${err.message}`);
    }

    // --- Strategy 3: Wikimedia Commons High-Res Media API ---
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&prop=pageimages&gsrsearch=${encodeURIComponent(q)}&gsrlimit=10&piprop=thumbnail&pithumbsize=1280&format=json`;
      const response = await axios.get(wikiUrl, { timeout: 8000 });
      const pages = response.data?.query?.pages || {};
      for (const pageId in pages) {
        const imgUrl = pages[pageId]?.thumbnail?.source;
        if (imgUrl && !usedUrls.has(imgUrl) && isGoodImageUrl(imgUrl)) {
          usedUrls.add(imgUrl);
          const saved = await downloadImage(imgUrl, outputPath);
          if (saved) {
            console.log(`[GoogleImage] Foto real baixada do Wikimedia para "${q}"`);
            return saved;
          }
        }
      }
    } catch (err) {}
  }

  throw new Error(`Nenhuma imagem real de alta qualidade foi encontrada para o termo: "${query}"`);
}

/**
 * Downloads image and validates minimum quality/size threshold (>= 35 KB to avoid blurry thumbnails).
 */
async function downloadImage(url, outputPath) {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      timeout: 12000,
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
      }, 15000);

      response.data.pipe(fileStream);

      fileStream.on('finish', async () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          const exists = await fs.pathExists(outputPath);
          if (exists) {
            const { size } = await fs.stat(outputPath);
            // Minimum size of 35 KB ensures HD resolution (avoids icons/thumbnails)
            if (size > 35000) {
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
