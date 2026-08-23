import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config/env.js';

// Domains and URL patterns known for spam, clickbait, vector sites, or unrelated junk
const BAD_DOMAINS = [
  /vazounudes/i,
  /xgozo/i,
  /porn/i,
  /sex/i,
  /peritoanimal/i,
  /instalguru/i,
  /vecteezy/i,
  /freepik/i,
  /alamy/i,
  /shutterstock/i,
  /dreamstime/i,
  /istockphoto/i,
  /thegirlonbloor/i,
  /feeds\.frgimages/i,
  /thesitebase/i,
  /pinterest\./i,
  /pinimg\./i,
  /deviantart\./i,
  /clipart/i,
  /sketch/i,
  /caricature/i,
  /watermark/i,
  /\.svg$/i,
  /\.gif$/i
];

function isReputableImage(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 15) return false;
  return !BAD_DOMAINS.some(bad => bad.test(url));
}

/**
 * Searches and downloads REAL images directly from Google / Bing image search.
 * Validates domain reputability and image resolution.
 *
 * @param {Object} options
 * @param {string} options.query Clean search query (e.g. "GTA 6 Lucia", "GTA 6 Vice City")
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
      timeout: 8000
    });

    const matches = [...res.data.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)].map(m => m[1]);
    for (const imgUrl of matches.slice(0, 15)) {
      if (imgUrl && !usedUrls.has(imgUrl) && isReputableImage(imgUrl)) {
        usedUrls.add(imgUrl);
        const saved = await downloadImage(imgUrl, outputPath);
        if (saved) {
          console.log(`[GoogleImage] Foto real oficial baixada para "${cleanQuery}": ${path.basename(imgUrl)}`);
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
        if (item.link && !usedUrls.has(item.link) && isReputableImage(item.link)) {
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
      if (imgUrl && !usedUrls.has(imgUrl) && isReputableImage(imgUrl)) {
        usedUrls.add(imgUrl);
        const saved = await downloadImage(imgUrl, outputPath);
        if (saved) return saved;
      }
    }
  } catch (err) {}

  throw new Error(`Nenhuma imagem real encontrada para: "${query}"`);
}

/**
 * Searches and returns candidate URLs of REAL images directly from Google / Bing / Wiki.
 *
 * @param {Object} options
 * @param {string} options.query Clean search query
 * @param {number} [options.maxResults=8] Maximum number of URLs to return
 * @param {Set<string>} [options.usedUrls] Set of already used image URLs
 * @returns {Promise<Array<string>>} List of valid image URLs
 */
export async function searchRealGoogleImageCandidates({ query, maxResults = 8, usedUrls = new Set() }) {
  const cleanQuery = (query || '').replace(/[^\w\s-]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanQuery) return [];

  const candidates = [];
  const localUsed = new Set(usedUrls);

  // Strategy 1: Bing Images search
  try {
    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(cleanQuery)}&form=HDRSC2&first=1`;
    const res = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 8000
    });

    const matches = [...res.data.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)].map(m => m[1]);
    for (const imgUrl of matches) {
      if (imgUrl && !localUsed.has(imgUrl) && isReputableImage(imgUrl)) {
        localUsed.add(imgUrl);
        candidates.push(imgUrl);
        if (candidates.length >= maxResults) break;
      }
    }
  } catch (err) {
    console.warn(`[GoogleImage] Busca de candidatos web falhou para "${cleanQuery}": ${err.message}`);
  }

  // Strategy 2: Google Custom Search (if available)
  const apiKey = config.googleSearchApiKey;
  const cx = config.googleSearchCx;
  if (candidates.length < maxResults && apiKey && cx) {
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
        if (item.link && !localUsed.has(item.link) && isReputableImage(item.link)) {
          localUsed.add(item.link);
          candidates.push(item.link);
          if (candidates.length >= maxResults) break;
        }
      }
    } catch (err) {}
  }

  // Strategy 3: Wikimedia Commons
  if (candidates.length < maxResults) {
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&prop=pageimages&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=10&piprop=thumbnail&pithumbsize=1280&format=json`;
      const response = await axios.get(wikiUrl, { timeout: 5000 });
      const pages = response.data?.query?.pages || {};
      for (const pageId in pages) {
        const imgUrl = pages[pageId]?.thumbnail?.source;
        if (imgUrl && !localUsed.has(imgUrl) && isReputableImage(imgUrl)) {
          localUsed.add(imgUrl);
          candidates.push(imgUrl);
          if (candidates.length >= maxResults) break;
        }
      }
    } catch (err) {}
  }

  return candidates;
}

/**
 * Downloads image directly with arraybuffer validation.
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

