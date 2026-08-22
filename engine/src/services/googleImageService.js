import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/env.js';
import { generateAiImage } from './aiImageService.js';

/**
 * Fetches a real image corresponding to the query from Google / Wikimedia / Unsplash / Flux.
 * Guaranteed to return a unique image for each scene without duplicates or static fallbacks.
 *
 * @param {Object} options
 * @param {string} options.query Search query (e.g., "GTA 6 Lucia Vice City screenshot")
 * @param {string} [options.imagePrompt] High-detail prompt for AI fallback
 * @param {string} options.outputPath Local file path to save the image (.jpg)
 * @param {Set<string>} [options.usedUrls] Set of image URLs already downloaded in this job
 * @param {number} [options.sceneIndex=0] Index of the scene
 * @returns {Promise<string>} Path to saved image
 */
export async function fetchRealGoogleImage({ query, imagePrompt, outputPath, usedUrls = new Set(), sceneIndex = 0 }) {
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

  // --- Strategy 2: Wikimedia Commons High-Res Media API ---
  try {
    const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&prop=pageimages&gsrsearch=${encodeURIComponent(query)}&gsrlimit=10&piprop=thumbnail&pithumbsize=1080&format=json`;
    const response = await axios.get(wikiUrl, { timeout: 8000 });
    const pages = response.data?.query?.pages || {};
    for (const pageId in pages) {
      const imgUrl = pages[pageId]?.thumbnail?.source;
      if (imgUrl && !usedUrls.has(imgUrl)) {
        usedUrls.add(imgUrl);
        const saved = await downloadImage(imgUrl, outputPath);
        if (saved) return saved;
      }
    }
  } catch (err) {}

  // --- Strategy 3: DuckDuckGo Public Image Search ---
  try {
    const searchUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 8000
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
  } catch (err) {}

  // --- Strategy 4: High-Quality Photorealistic FLUX AI Generation (Unique per scene) ---
  try {
    const fallbackPrompt = imagePrompt || `${query}, photorealistic 8k game screenshot, Unreal Engine 5 render, cinematic lighting`;
    await generateAiImage({
      prompt: fallbackPrompt,
      outputFilePath: outputPath,
      width: 720,
      height: 1280,
      seed: Math.floor(Math.random() * 1000000) + sceneIndex * 777
    });
    if (await fs.pathExists(outputPath)) {
      return outputPath;
    }
  } catch (err) {
    console.warn(`[GoogleImage] Fallback IA falhou para cena ${sceneIndex + 1}: ${err.message}`);
  }

  throw new Error(`Não foi possível carregar imagem única para a cena ${sceneIndex + 1}: "${query}"`);
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
