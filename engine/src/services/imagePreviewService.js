import axios from 'axios';
import { db } from '../config/firebase.js';
import { config } from '../config/env.js';
import { decryptCredential } from './vaultService.js';
import { generateVideoScript } from './geminiService.js';
import { searchRealGoogleImageCandidates } from './googleImageService.js';

const FORBIDDEN_WORDS_REGEX = /\b(anteriores|anterior|antigo|como|olha|veja|isso|quando|porque|sobre|mais|menos|detalhe|curiosidade|historia|evolucao|comparison|compare|previous|history|about|how|why|details|framework|flight|shoes|tenis|logo|banner|icon)\b/gi;

/**
 * Combines theme and scene query cleanly into a concrete physical search term.
 */
function buildConcreteSceneQuery(mainTheme = '', sceneQuery = '', sceneIndex = 0) {
  const cleanMain = (mainTheme || '').replace(FORBIDDEN_WORDS_REGEX, '').replace(/[^\w\s-]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cleanScene = (sceneQuery || '').replace(FORBIDDEN_WORDS_REGEX, '').replace(/[^\w\s-]/gi, ' ').replace(/\s+/g, ' ').trim();

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

  const theme = cleanMain || 'Technology';
  const defaultAngles = [
    theme,
    `${theme} main characters`,
    `${theme} landscape scenery`,
    `${theme} action scene`,
    `${theme} showcase view`
  ];

  return defaultAngles[sceneIndex % defaultAngles.length];
}

/**
 * Queries Pexels Photo API for high-resolution vertical portrait photos.
 */
async function searchPexelsPhotos({ query, pexelsApiKey, count = 6 }) {
  if (!pexelsApiKey || !query) return [];
  try {
    const res = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: pexelsApiKey },
      params: { query, per_page: count, orientation: 'portrait' },
      timeout: 7000
    });
    const photos = res.data?.photos || [];
    return photos
      .map(p => p.src?.large2x || p.src?.large || p.src?.portrait || p.src?.original)
      .filter(Boolean);
  } catch (err) {
    console.warn(`[ImagePreview] Pexels photos falhou para "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Generates Pollinations AI image preview URLs with varied seeds and models (Flux / Turbo).
 */
function generatePollinationsUrls(prompt, count = 4) {
  const clean = encodeURIComponent(
    `${prompt || 'cinematic hyperrealistic scene'}, 8k resolution, cinematic lighting, photorealistic photograph, national geographic style, ultra detailed, 9:16 vertical portrait`
  );
  const baseSeed = Math.floor(Math.random() * 1000000);
  const models = ['flux', 'flux', 'turbo', 'flux'];

  return Array.from({ length: count }, (_, i) => {
    const model = models[i % models.length];
    const seed = baseSeed + i * 47;
    return `https://image.pollinations.ai/prompt/${clean}?width=720&height=1280&nologo=true&seed=${seed}&model=${model}`;
  });
}

/**
 * Generates structured video scenes with Gemini and brings visual image choices for each scene.
 *
 * @param {Object} options
 * @param {string} options.tenantId Channel ID
 * @param {string} [options.topic] Theme/Subject
 * @param {string} [options.instruction] Direct operator instructions
 * @param {string} [options.mediaPreference='auto'] 'google_image' | 'ai_image' | 'pexels' | 'auto'
 * @returns {Promise<Object>} Video overview and scenes with images
 */
export async function generateImagePreview({
  tenantId,
  topic = null,
  instruction = null,
  mediaPreference = 'auto'
}) {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) {
    throw new Error(`Canal '${tenantId}' não encontrado.`);
  }

  const tenantData = tenantSnap.data();
  const vaultSnap = await tenantRef.collection('credentials').doc('vault').get();
  const vaultData = vaultSnap.exists ? vaultSnap.data() : {};

  const geminiKey = decryptCredential(vaultData.geminiApiKey) || config.geminiApiKey;
  const pexelsKey = decryptCredential(vaultData.pexelsApiKey) || config.pexelsApiKey;
  const serperKey = decryptCredential(vaultData.serperApiKey) || config.serperApiKey;

  if (!geminiKey) {
    throw new Error('Nenhuma chave GEMINI_API_KEY disponível para gerar o roteiro e as cenas.');
  }

  // 1. Generate Script Scenes with Gemini
  const scriptJson = await generateVideoScript({
    apiKey: geminiKey,
    niche: tenantData.niche || tenantData.nicho || 'Curiosidades Gerais',
    brandIdentity: tenantData.brandIdentity || tenantData.tomDeVoz || 'Dinâmico e direto',
    language: tenantData.language || 'pt-BR',
    topic,
    instruction
  });

  const mainVisualTheme = scriptJson.mainVisualTheme || topic || 'General Topic';
  const scenes = [];
  const usedUrls = new Set();

  const sections = Array.isArray(scriptJson.sections) && scriptJson.sections.length > 0
    ? scriptJson.sections
    : [{ text: scriptJson.hook, visualSearchQuery: mainVisualTheme, imagePrompt: mainVisualTheme, durationEstSeconds: 6 }];

  // 2. Fetch images for each scene concurrently in parallel
  const scenes = await Promise.all(
    sections.map(async (section, index) => {
      const rawQuery = section.visualSearchQuery || section.imagePrompt || mainVisualTheme;
      const concreteQuery = buildConcreteSceneQuery(mainVisualTheme, rawQuery, index);
      const aiPrompt = section.imagePrompt || concreteQuery;

      let candidateUrls = [];
      let detectedSource = mediaPreference;

      if (mediaPreference === 'ai_image') {
        candidateUrls = generatePollinationsUrls(aiPrompt, 4);
        detectedSource = 'ai_image';
      } else if (mediaPreference === 'pexels') {
        candidateUrls = await searchPexelsPhotos({ query: concreteQuery, pexelsApiKey: pexelsKey, count: 6 });
        if (candidateUrls.length === 0) {
          candidateUrls = await searchRealGoogleImageCandidates({
            query: concreteQuery,
            maxResults: 6,
            serperApiKey: serperKey,
            pexelsApiKey: pexelsKey
          });
          detectedSource = 'google_image';
        } else {
          detectedSource = 'pexels';
        }
      } else if (mediaPreference === 'google_image') {
        candidateUrls = await searchRealGoogleImageCandidates({
          query: concreteQuery,
          maxResults: 6,
          serperApiKey: serperKey,
          pexelsApiKey: pexelsKey
        });
        if (candidateUrls.length === 0) {
          // Fallback to main theme search
          candidateUrls = await searchRealGoogleImageCandidates({
            query: mainVisualTheme,
            maxResults: 6,
            serperApiKey: serperKey,
            pexelsApiKey: pexelsKey
          });
        }
        if (candidateUrls.length === 0) {
          // Fallback to AI generation
          candidateUrls = generatePollinationsUrls(aiPrompt, 3);
          detectedSource = 'ai_image';
        } else {
          detectedSource = 'google_image';
        }
      } else {
        // 'auto' mode: Prioritize Google/Bing real web search, then append AI option
        candidateUrls = await searchRealGoogleImageCandidates({
          query: concreteQuery,
          maxResults: 5,
          serperApiKey: serperKey,
          pexelsApiKey: pexelsKey
        });
        if (candidateUrls.length > 0) {
          detectedSource = 'google_image';
          // Add 1 AI alternative for variety
          const aiAlternative = generatePollinationsUrls(aiPrompt, 1);
          candidateUrls.push(...aiAlternative);
        } else {
          // If web search yielded no images, use AI Flux
          candidateUrls = generatePollinationsUrls(aiPrompt, 4);
          detectedSource = 'ai_image';
        }
      }

      return {
        sceneIndex: index,
        text: section.text || '',
        durationEstSeconds: section.durationEstSeconds || 6,
        visualSearchQuery: concreteQuery,
        imagePrompt: aiPrompt,
        imageUrl: candidateUrls[0] || generatePollinationsUrls(aiPrompt, 1)[0],
        alternativeUrls: candidateUrls.slice(1),
        source: detectedSource
      };
    })
  );

  return {
    title: scriptJson.title,
    hook: scriptJson.hook,
    mainVisualTheme,
    soundMood: scriptJson.soundMood || 'energetic',
    hashtags: scriptJson.hashtags || ['#shorts'],
    mediaPreference,
    scenes
  };
}

/**
 * Searches / regenerates image candidates for a single scene on the fly.
 *
 * @param {Object} options
 * @param {string} options.query Search query
 * @param {string} [options.prompt] AI generation prompt
 * @param {string} [options.source='google_image'] 'google_image' | 'ai_image' | 'pexels'
 * @param {string} [options.tenantId]
 * @returns {Promise<Object>} Candidates array and active image
 */
export async function searchSingleSceneImages({
  query = '',
  prompt = '',
  source = 'google_image',
  tenantId = null
}) {
  let pexelsKey = config.pexelsApiKey;
  let serperKey = config.serperApiKey;

  if (tenantId) {
    try {
      const vaultSnap = await db.collection('tenants').doc(tenantId).collection('credentials').doc('vault').get();
      if (vaultSnap.exists) {
        const vaultData = vaultSnap.data();
        pexelsKey = decryptCredential(vaultData.pexelsApiKey) || pexelsKey;
        serperKey = decryptCredential(vaultData.serperApiKey) || serperKey;
      }
    } catch (e) {}
  }

  const cleanQuery = (query || prompt || '').trim();
  let candidates = [];

  if (source === 'ai_image') {
    candidates = generatePollinationsUrls(prompt || cleanQuery, 5);
  } else if (source === 'pexels') {
    candidates = await searchPexelsPhotos({ query: cleanQuery, pexelsApiKey: pexelsKey, count: 6 });
    if (candidates.length === 0) {
      candidates = await searchRealGoogleImageCandidates({
        query: cleanQuery,
        maxResults: 6,
        serperApiKey: serperKey,
        pexelsApiKey: pexelsKey
      });
    }
  } else {
    // google_image default
    candidates = await searchRealGoogleImageCandidates({
      query: cleanQuery,
      maxResults: 8,
      serperApiKey: serperKey,
      pexelsApiKey: pexelsKey
    });
    if (candidates.length === 0) {
      candidates = generatePollinationsUrls(prompt || cleanQuery, 4);
    }
  }

  return {
    query: cleanQuery,
    prompt: prompt || cleanQuery,
    source,
    imageUrl: candidates[0] || null,
    alternativeUrls: candidates.slice(1)
  };
}
