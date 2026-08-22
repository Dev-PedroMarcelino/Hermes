import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/env.js';

/**
 * Fetches a real image from Google Custom Search API or DuckDuckGo Image Search.
 *
 * @param {Object} options
 * @param {string} options.query Search query (e.g., "GTA 6 Lucia Vice City screenshot")
 * @param {string} options.outputPath Local file path to save the image (.jpg)
 * @param {Set<string>} [options.usedUrls] Set of image URLs already downloaded in this job
 * @returns {Promise<string>} Path to saved image
 */
export async function fetchRealGoogleImage({ query, outputPath, usedUrls = new Set() }) {
  await fs.ensureDir(path.dirname(outputPath));

  const apiKey = config.googleSearchApiKey;
  const cx = config.googleSearchCx;

  // --- Strategy 1: Official Google Custom Search JSON API ---
  if (apiKey && cx) {
    try {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: apiKey,
          cx: cx,
          q: query,
          searchType: 'image',
          imgSize: 'LARGE',
          num: 10
        },
        timeout: 10000
      });

      const items = response.data?.items || [];
      for (const item of items) {
        if (item.link && !usedUrls.has(item.link)) {
          usedUrls.add(item.link);
          const saved = await downloadImage(item.link, outputPath);
          if (saved) return saved;
        }
      }
    } catch (err) {
      console.warn(`[GoogleImage] Falha na busca via Google API para "${query}": ${err.message}`);
    }
  }

  // --- Strategy 2: DuckDuckGo / Public Image Search (Zero API Key Fallback) ---
  try {
    const searchUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const results = response.data?.results || [];
    for (const item of results) {
      const imgUrl = item.image || item.thumbnail;
      if (imgUrl && !usedUrls.has(imgUrl)) {
        usedUrls.add(imgUrl);
        const saved = await downloadImage(imgUrl, outputPath);
        if (saved) return saved;
      }
    }
  } catch (err) {
    console.warn(`[GoogleImage] Falha no fallback DuckDuckGo para "${query}": ${err.message}`);
  }

  // --- Strategy 3: Unsplash High Quality Image Search (Final Fallback) ---
  try {
    const unsplashUrl = `https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1080&h=1920&q=80`;
    const saved = await downloadImage(unsplashUrl, outputPath);
    if (saved) return saved;
  } catch (err) {}

  throw new Error(`Não foi possível encontrar imagem real para o termo: "${query}"`);
}

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
            if (size > 3000) return resolve(outputPath);
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
