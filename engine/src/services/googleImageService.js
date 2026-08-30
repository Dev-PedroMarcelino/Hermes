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
  /redbubble\./i,
  /etsy\./i,
  /aliexpress\./i,
  /taobao\./i,
  /ebay\./i,
  /clipart/i,
  /sketch/i,
  /caricature/i,
  /watermark/i,
  /\.svg$/i,
  /\.gif$/i
];

function isReputableImage(url, query = '') {
  if (!url || typeof url !== 'string') return false;
  if (url.length < 15) return false;
  // Ignore base64 / blob / small placeholders
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;

  const lowerUrl = url.toLowerCase();
  const lowerQuery = (query || '').toLowerCase();

  // Strict check for GTA 6: reject URLs containing GTA 5 / GTAV / GTA Online
  if (lowerQuery.includes('gta 6') || lowerQuery.includes('gta vi') || lowerQuery.includes('gta6')) {
    if (/(gta-?5|gtav|gta-v|gta-online|gta_v|gta_5|grand-theft-auto-v|grand-theft-auto-5|grand-theft-auto-online)/i.test(lowerUrl)) {
      return false;
    }
  }

  // Dynamic previous version exclusion (e.g. if query is "GTA 6", exclude "gta-5", "gta-v", "gta5"; if "iPhone 16", exclude "iphone-15", "iphone15")
  const versionMatch = lowerQuery.match(/\b([a-z]+)\s*(\d+)\b/);
  if (versionMatch) {
    const prefix = versionMatch[1];
    const num = parseInt(versionMatch[2], 10);
    if (num > 1) {
      const prevNum = num - 1;
      const prevRegex = new RegExp(`\\b(${prefix}-?${prevNum}|${prefix}${prevNum})\\b`, 'i');
      if (prevRegex.test(lowerUrl) && !lowerQuery.includes(`${prefix} ${prevNum}`)) {
        return false;
      }
    }
  }

  return !BAD_DOMAINS.some(bad => bad.test(url));
}

const BING_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cookie': 'SRCHHPGUSR=ADLT=OFF&NRSLT=50; _EDGE_S=F=1; MUID=301828391823;'
};

/**
 * Universal search query generator focused on journalistic relevance, leaks, and high resolution.
 * Removes wallpaper/screen dimension clutter and adds franchise negative filters.
 */
function buildSearchQueryVariants(rawQuery) {
  const clean = (rawQuery || '').replace(/[^\w\s-]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const lowerClean = clean.toLowerCase();
  const words = clean.split(/\s+/);
  const variants = [];

  // Dynamic negative filter for versioned topics & noisy franchises
  let dynamicNegative = '';

  // 1. Version match (e.g. "GTA 6", "iPhone 16", "PS 5")
  const versionMatch = clean.match(/\b([a-zA-Z]+)\s*(\d+)\b/);
  if (versionMatch) {
    const prefix = versionMatch[1];
    const num = parseInt(versionMatch[2], 10);
    if (num > 1) {
      const prevNum = num - 1;
      dynamicNegative += ` -${prefix}${prevNum} -"${prefix} ${prevNum}"`;
      if (prefix.toLowerCase() === 'gta') {
        dynamicNegative += ' -GTAV -GTA5 -"GTA Online" -"GTA 5"';
      }
    }
  }

  // 2. Franchise specific negative filters for unreleased / previous movie/game noise
  if (lowerClean.includes('doomsday') || lowerClean.includes('avengers')) {
    if (lowerClean.includes('doomsday')) {
      dynamicNegative += ' -"Infinity War" -"Endgame" -"Ultron" -"Age of Ultron"';
    }
  }
  if (lowerClean.includes('gta 6') || lowerClean.includes('gta vi') || lowerClean.includes('gta6')) {
    if (!dynamicNegative.includes('-GTA5')) {
      dynamicNegative += ' -GTAV -GTA5 -"GTA Online" -"GTA 5"';
    }
  }
  if (lowerClean.includes('ps5') || lowerClean.includes('playstation 5')) {
    dynamicNegative += ' -PS4 -"PlayStation 4" -PS3';
  }

  // 3. Build variants focused on journalistic relevance, official screenshots, leaks, and high resolution
  if (words.length >= 3) {
    const mainEntity = words.slice(0, 2).join(' ');
    const rest = words.slice(2).join(' ');
    variants.push(`"${mainEntity}" ${rest} official screenshot${dynamicNegative}`);
    variants.push(`"${mainEntity}" ${rest} leak high resolution${dynamicNegative}`);
    variants.push(`"${mainEntity}" ${rest} official poster hd photo${dynamicNegative}`);
    variants.push(`"${mainEntity}" ${rest}${dynamicNegative}`);
  } else if (words.length === 2) {
    variants.push(`"${clean}" official screenshot${dynamicNegative}`);
    variants.push(`"${clean}" leak high resolution${dynamicNegative}`);
    variants.push(`"${clean}" official poster hd photo${dynamicNegative}`);
    variants.push(`"${clean}"${dynamicNegative}`);
  }

  variants.push(`${clean} official screenshot${dynamicNegative}`);
  variants.push(`${clean} high resolution hd photo${dynamicNegative}`);
  variants.push(`${clean}${dynamicNegative}`);

  return Array.from(new Set(variants));
}

/**
 * Searches and downloads REAL images directly from Google / Bing image search.
 * Validates domain reputability and image resolution.
 *
 * @param {Object} options
 * @param {string} options.query Clean search query (e.g. "GTA 6 Lucia", "GTA 6 Vice City")
 * @param {string} options.outputPath Local file path to save the image (.jpg)
 * @param {Set<string>} [options.usedUrls] Set of image URLs already downloaded in this job
 * @param {string} [options.serperApiKey]
 * @param {string} [options.pexelsApiKey]
 * @returns {Promise<string>} Path to saved real image
 */
export async function fetchRealGoogleImage({
  query,
  outputPath,
  usedUrls = new Set(),
  serperApiKey = null,
  pexelsApiKey = null
}) {
  await fs.ensureDir(path.dirname(outputPath));

  const candidates = await searchRealGoogleImageCandidates({
    query,
    maxResults: 8,
    usedUrls,
    serperApiKey,
    pexelsApiKey
  });

  for (const imgUrl of candidates) {
    if (!imgUrl || usedUrls.has(imgUrl)) continue;

    usedUrls.add(imgUrl);
    const saved = await downloadImage(imgUrl, outputPath);
    if (saved) {
      console.log(`[GoogleImage] Foto real oficial baixada para "${query}": ${path.basename(imgUrl)}`);
      return saved;
    }
  }

  throw new Error(`Nenhuma imagem real encontrada para: "${query}"`);
}

/**
 * Searches and returns candidate URLs of REAL images from Serper Google Images,
 * Google Custom Search, Enhanced Bing Scraper, or Pexels Photos.
 *
 * @param {Object} options
 * @param {string} options.query Clean search query
 * @param {number} [options.maxResults=8] Maximum number of URLs to return
 * @param {Set<string>} [options.usedUrls] Set of already used image URLs
 * @param {string} [options.serperApiKey]
 * @param {string} [options.pexelsApiKey]
 * @returns {Promise<Array<string>>} List of valid image URLs
 */
export async function searchRealGoogleImageCandidates({
  query,
  maxResults = 8,
  usedUrls = new Set(),
  serperApiKey = null,
  pexelsApiKey = null
}) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return [];

  const candidates = [];
  const localUsed = new Set(usedUrls);

  // Strategy 1: Serper.dev Google Images API (100% cloud & datacenter friendly)
  const activeSerperKey = serperApiKey || config.serperApiKey;
  if (activeSerperKey) {
    try {
      const res = await axios.post(
        'https://google.serper.dev/images',
        { q: cleanQuery, num: Math.min(maxResults * 2, 20) },
        {
          headers: {
            'X-API-KEY': activeSerperKey,
            'Content-Type': 'application/json'
          },
          timeout: 4000
        }
      );
      const serperImages = res.data?.images || [];
      for (const item of serperImages) {
        const link = item.imageUrl;
        if (link && !localUsed.has(link) && isReputableImage(link, cleanQuery)) {
          localUsed.add(link);
          candidates.push(link);
          if (candidates.length >= maxResults) break;
        }
      }
      if (candidates.length > 0) {
        console.log(`[GoogleImage] Serper API retornou ${candidates.length} imagens para "${cleanQuery}"`);
      }
    } catch (err) {
      console.warn(`[GoogleImage] Serper API falhou: ${err.message}`);
    }
  }

  // Strategy 2: Google Custom Search JSON API (Official Google Cloud)
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
        timeout: 4000
      });

      const items = response.data?.items || [];
      for (const item of items) {
        if (item.link && !localUsed.has(item.link) && isReputableImage(item.link, cleanQuery)) {
          localUsed.add(item.link);
          candidates.push(item.link);
          if (candidates.length >= maxResults) break;
        }
      }
      if (candidates.length > 0) {
        console.log(`[GoogleImage] Google Custom Search retornou imagens para "${cleanQuery}"`);
      }
    } catch (err) {
      console.warn(`[GoogleImage] Google Custom Search falhou: ${err.message}`);
    }
  }

  // Strategy 3: Bing Image Scraping with Top Query Variants & Enhanced Headers
  if (candidates.length < maxResults) {
    const queryVariants = buildSearchQueryVariants(cleanQuery).slice(0, 2);
    for (const q of queryVariants) {
      if (candidates.length >= maxResults) break;
      try {
        const searchUrl = `https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=1&count=35&adlt=off`;
        const res = await axios.get(searchUrl, {
          headers: BING_HEADERS,
          timeout: 4000
        });

        const matches = [...res.data.matchAll(/murl&quot;:&quot;(https?:[^&]+)&quot;/g)].map(m => m[1]);
        for (const imgUrl of matches) {
          if (imgUrl && !localUsed.has(imgUrl) && isReputableImage(imgUrl, cleanQuery)) {
            localUsed.add(imgUrl);
            candidates.push(imgUrl);
            if (candidates.length >= maxResults) break;
          }
        }
      } catch (err) {
        console.warn(`[GoogleImage] Busca de candidatos Bing falhou para "${q}": ${err.message}`);
      }
    }
  }

  // Strategy 4: High-Res Pexels Stock Photos Fallback (if real web scraping returned 0)
  const activePexelsKey = pexelsApiKey || config.pexelsApiKey;
  if (candidates.length === 0 && activePexelsKey) {
    try {
      const pexelsRes = await axios.get('https://api.pexels.com/v1/search', {
        headers: { Authorization: activePexelsKey },
        params: { query: cleanQuery, per_page: maxResults, orientation: 'portrait' },
        timeout: 4000
      });
      const photos = pexelsRes.data?.photos || [];
      for (const p of photos) {
        const pUrl = p.src?.large2x || p.src?.large || p.src?.portrait || p.src?.original;
        if (pUrl && !localUsed.has(pUrl)) {
          localUsed.add(pUrl);
          candidates.push(pUrl);
        }
      }
      if (candidates.length > 0) {
        console.log(`[GoogleImage] Pexels Photos retornou ${candidates.length} fotos para "${cleanQuery}"`);
      }
    } catch (e) {}
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


