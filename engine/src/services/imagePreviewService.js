import axios from 'axios';
import { db } from '../config/firebase.js';
import { config } from '../config/env.js';
import { decryptCredential } from './vaultService.js';
import { generateVideoScript } from './geminiService.js';
import { searchRealGoogleImageCandidates } from './googleImageService.js';
import { searchWebVideoCandidates } from './webVideoService.js';

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
 * Generates structured video scenes with Gemini and brings visual choices for each scene.
 *
 * @param {Object} options
 * @param {string} options.tenantId Channel ID
 * @param {string} [options.topic] Theme/Subject
 * @param {string} [options.instruction] Direct operator instructions
 * @param {string} [options.mediaPreference='web_video'] 'web_video' | 'google_image' | 'ai_image' | 'pexels' | 'auto'
 * @returns {Promise<Object>} Video overview and scenes with images/videos
 */
export async function generateImagePreview({
  tenantId,
  topic = null,
  instruction = null,
  mediaPreference = 'web_video'
}) {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();
  if (!tenantSnap.exists) {
    throw new Error(`Canal '${tenantId}' não encontrado.`);
  }

  const tenantData = tenantSnap.data();

  // Resolve API Keys from tenant vault
  let geminiKey = config.geminiApiKey;
  let pexelsKey = config.pexelsApiKey;
  let serperKey = config.serperApiKey;

  try {
    const vaultSnap = await tenantRef.collection('credentials').doc('vault').get();
    if (vaultSnap.exists) {
      const vaultData = vaultSnap.data();
      geminiKey = decryptCredential(vaultData.geminiApiKey) || geminiKey;
      pexelsKey = decryptCredential(vaultData.pexelsApiKey) || pexelsKey;
      serperKey = decryptCredential(vaultData.serperApiKey) || serperKey;
    }
  } catch (err) {
    console.warn('[ImagePreview] Erro ao ler vault:', err.message);
  }

  if (!geminiKey) {
    throw new Error('Chave da API do Google Gemini não encontrada.');
  }

  // 1. Generate Structured Script with Gemini
  const scriptJson = await generateVideoScript({
    apiKey: geminiKey,
    niche: tenantData.niche || 'Geral',
    brandIdentity: tenantData.aiPrompt || 'Vídeo dinâmico e viral',
    language: tenantData.language || 'pt-BR',
    topic,
    instruction
  });

  const mainVisualTheme = scriptJson.mainVisualTheme || topic || 'General Topic';

  const sections = Array.isArray(scriptJson.sections) && scriptJson.sections.length > 0
    ? scriptJson.sections
    : [{ text: scriptJson.hook, visualSearchQuery: mainVisualTheme, imagePrompt: mainVisualTheme, durationEstSeconds: 6 }];

  // 2. Fetch media candidates for each scene concurrently
  const scenes = await Promise.all(
    sections.map(async (section, index) => {
      const rawQuery = section.visualSearchQuery || section.imagePrompt || mainVisualTheme;
      const concreteQuery = buildConcreteSceneQuery(mainVisualTheme, rawQuery, index);
      const aiPrompt = section.imagePrompt || concreteQuery;

      let candidateUrls = [];
      let videoUrl = null;
      let detectedSource = mediaPreference;

      if (mediaPreference === 'web_video' || mediaPreference === 'stock_video') {
        const videoCandidates = await searchWebVideoCandidates({
          query: concreteQuery,
          pexelsApiKey: pexelsKey,
          count: 5
        });

        if (videoCandidates.length > 0) {
          videoUrl = videoCandidates[0].videoUrl;
          candidateUrls = videoCandidates.map(v => v.thumbnailUrl || v.videoUrl).filter(Boolean);
          detectedSource = 'web_video';
        } else {
          // Fallback to real web photos
          candidateUrls = await searchRealGoogleImageCandidates({
            query: concreteQuery,
            maxResults: 6,
            serperApiKey: serperKey,
            pexelsApiKey: pexelsKey
          });
          detectedSource = 'google_image';
        }
      } else if (mediaPreference === 'ai_image') {
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
        // 'auto' mode: Prioritize real web video, then Google photo, then AI
        const videoCandidates = await searchWebVideoCandidates({
          query: concreteQuery,
          pexelsApiKey: pexelsKey,
          count: 3
        });

        if (videoCandidates.length > 0) {
          videoUrl = videoCandidates[0].videoUrl;
          candidateUrls = videoCandidates.map(v => v.thumbnailUrl || v.videoUrl).filter(Boolean);
          detectedSource = 'web_video';
        } else {
          candidateUrls = await searchRealGoogleImageCandidates({
            query: concreteQuery,
            maxResults: 5,
            serperApiKey: serperKey,
            pexelsApiKey: pexelsKey
          });
          detectedSource = 'google_image';
        }
      }

      const defaultImage = candidateUrls[0] || generatePollinationsUrls(aiPrompt, 1)[0];

      return {
        sceneIndex: index,
        text: section.text || '',
        durationEstSeconds: section.durationEstSeconds || 6,
        visualSearchQuery: concreteQuery,
        imagePrompt: aiPrompt,
        imageUrl: defaultImage,
        videoUrl: videoUrl || null,
        isVideo: Boolean(videoUrl),
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
 * Searches / regenerates media candidates for a single scene on the fly.
 *
 * @param {Object} options
 * @param {string} options.query Search query
 * @param {string} [options.prompt] AI generation prompt
 * @param {string} [options.source='web_video'] 'web_video' | 'google_image' | 'ai_image' | 'pexels'
 * @param {string} [options.tenantId]
 * @returns {Promise<Object>} Candidates array and active image/video
 */
export async function searchSingleSceneImages({
  query = '',
  prompt = '',
  source = 'web_video',
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
  let videoUrl = null;

  if (source === 'web_video' || source === 'stock_video') {
    const videoCandidates = await searchWebVideoCandidates({
      query: cleanQuery,
      pexelsApiKey: pexelsKey,
      count: 6
    });
    if (videoCandidates.length > 0) {
      videoUrl = videoCandidates[0].videoUrl;
      candidates = videoCandidates.map(v => v.thumbnailUrl || v.videoUrl).filter(Boolean);
    } else {
      candidates = await searchRealGoogleImageCandidates({
        query: cleanQuery,
        maxResults: 6,
        serperApiKey: serperKey,
        pexelsApiKey: pexelsKey
      });
    }
  } else if (source === 'ai_image') {
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
    videoUrl: videoUrl || null,
    isVideo: Boolean(videoUrl),
    alternativeUrls: candidates.slice(1)
  };
}
