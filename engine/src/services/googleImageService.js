import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/env.js';

// Filters out only actual spam, low-res cliparts, and vector websites
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
  /\.svg$/i,
  /\.gif$/i
];

function isGoodImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 15) return false;
  return !BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Searches and downloads REAL images directly from Google / Bing image search.
 * Just like a human searching on Google Images.
 *
 * @param {Object} options
 * @param {string} options.query Search query (e.g. "GTA 6 Lucia", "GTA 6 Vice City")
 * @param {string} options.outputPath Local file path to save the image (.jpg)
 * @param {Set<string>} [options.usedUrls] Set of image URLs already downloaded in this job
 * @returns {Promise<string>} Path to saved real image
 */
export async function fetchRealGoogleImage({ query, outputPath, usedUrls = new Set() }) {
  await fs.ensureDir(path.dirname(outputPath));

  const apiKey = config.googleSearchApiKey;
  const cx = config.googleSearchCx;

  const cleanQuery = query.replace(/[^\w\s-]/gi, ' ').replace(/\s+/g, ' ').trim();

  // --- Strategy 1: Direct Web Image Search (Bing Images engine) ---
  try {
    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(cleanQuery)}&form=HDRSC2&first=1`;
    const res = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 7000
    });

    const matches = [...res.data.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)].map(m => m[1]);
    for (const imgUrl of matches.slice(0, 15)) {
      if (imgUrl && !usedUrls.has(imgUrl) && isGoodImageUrl(imgUrl)) {
        usedUrls.add(imgUrl);
        const saved = await downloadImage(imgUrl, outputPath);
        if (saved) {
          console.log(`[GoogleImage] Foto real baixada para "${cleanQuery}": ${path.basename(imgUrl)}`);
          return saved;
        }
      }
    }
  } catch (err) {
    console.warn(`[GoogleImage] Busca na web falhou para "${cleanQuery}": ${err.message}`);
  }

  // --- Strategy 2: Official Google Custom Search JSON API (if configured) ---
  if (apiKey && cx) {
    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: apiKey,
          cx: cx,
          q: cleanQuery,
          searchType: 'image',
          imgSize: 'LARGE',
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

  throw new Error(`Nenhuma imagem real encontrada na web para: "${query}"`);
}

/**
 * Downloads image directly with arraybuffer / stream validation.
 */
async function downloadImage(url, outputPath) {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer',
      timeout: 7000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.data && response.data.length > 20000) {
      await fs.writeFile(outputPath, response.data);
      return outputPath;
    }
    return null;
  } catch (e) {
    return null;
  }
}
