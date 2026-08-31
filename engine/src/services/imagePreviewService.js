import axios from 'axios';
import { db } from '../config/firebase.js';
import { config } from '../config/env.js';
import { decryptCredential } from './vaultService.js';
import { generateVideoScript } from './geminiService.js';
import { searchRealGoogleImageCandidates } from './googleImageService.js';
import { searchWebVideoMetadata } from './webVideoService.js';

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
 * Generates structured video scenes with Gemini and brings visual choices for each scene (fast 2-3s cuts).
 *
 * @param {Object} options
 * @param {string} options.tenantId Channel ID
 * @param {string} [options.topic] Theme/Subject
 * @param {string} [options.instruction] Direct operator instructions
 * @param {string} [options.mediaPreference='google_image'] 'google_image' | 'ai_image'
 * @returns {Promise<Object>} Video overview and scenes with images
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
  let serperKey = config.serperApiKey;

  try {
    const vaultSnap = await tenantRef.collection('credentials').doc('vault').get();
    if (vaultSnap.exists) {
      const vaultData = vaultSnap.data();
      geminiKey = decryptCredential(vaultData.geminiApiKey) || geminiKey;
      serperKey = decryptCredential(vaultData.serperApiKey) || serperKey;
    }
  } catch (err) {
    console.warn('[ImagePreview] Erro ao ler vault:', err.message);
  }

  if (!geminiKey) {
    throw new Error('Chave da API do Google Gemini não encontrada.');
  }

  // 1. Generate Structured Script with Gemini (2-3s fast visual cuts)
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
    : [{ text: scriptJson.hook, visualSearchQuery: mainVisualTheme, imagePrompt: mainVisualTheme, durationEstSeconds: 3 }];

  // 2. Fetch media candidates (Hybrid Videos & Images) for each scene concurrently
  const preferWebVideos = mediaPreference === 'web_video';

  const scenes = await Promise.all(
    sections.map(async (section, index) => {
      const rawQuery = section.visualSearchQuery || section.imagePrompt || mainVisualTheme;
      const concreteQuery = buildConcreteSceneQuery(mainVisualTheme, rawQuery, index);
      const aiPrompt = section.imagePrompt || concreteQuery;

      // Determine scene target media: respect section.mediaType or alternate for dynamic hybrid rhythm
      const shouldBeVideo = preferWebVideos && (section.mediaType ? section.mediaType === 'video' : (index === 0 || index % 2 === 0));

      let candidateUrls = [];
      let videoInfo = null;
      let detectedSource = mediaPreference;

      if (mediaPreference === 'ai_image') {
        candidateUrls = generatePollinationsUrls(aiPrompt, 4);
        detectedSource = 'ai_image';
      } else {
        // Concurrently search Web Video metadata and Google 4K images
        const [videoResults, googleImages] = await Promise.all([
          shouldBeVideo ? searchWebVideoMetadata(concreteQuery, 2).catch(() => []) : Promise.resolve([]),
          searchRealGoogleImageCandidates({
            query: concreteQuery,
            maxResults: 6,
            serperApiKey: serperKey
          }).catch(() => [])
        ]);

        let resolvedImages = googleImages;
        if (resolvedImages.length === 0) {
          resolvedImages = await searchRealGoogleImageCandidates({
            query: mainVisualTheme,
            maxResults: 6,
            serperApiKey: serperKey
          }).catch(() => []);
        }

        if (shouldBeVideo && videoResults.length > 0) {
          videoInfo = videoResults[0];
          detectedSource = 'web_video';
          candidateUrls = [videoInfo.thumbnailUrl, ...resolvedImages].filter(Boolean);
        } else {
          detectedSource = 'google_image';
          candidateUrls = resolvedImages.length > 0 ? resolvedImages : generatePollinationsUrls(aiPrompt, 3);
        }
      }

      const defaultImage = candidateUrls[0] || generatePollinationsUrls(aiPrompt, 1)[0];
      const isVideoScene = Boolean(videoInfo);

      // For image scenes, build subCuts showing the 2 to 3 photos that alternate every 2.5s
      const subCuts = !isVideoScene && candidateUrls.length > 1
        ? candidateUrls.slice(0, 3).map((url, cutIdx) => ({
            cutIndex: cutIdx + 1,
            url,
            durationEstSeconds: 2.5
          }))
        : [];

      return {
        sceneIndex: index,
        text: section.text || '',
        durationEstSeconds: section.durationEstSeconds || (isVideoScene ? 8 : 6),
        visualSearchQuery: concreteQuery,
        imagePrompt: aiPrompt,
        imageUrl: defaultImage,
        videoUrl: videoInfo?.videoUrl || null,
        embedUrl: videoInfo?.embedUrl || null,
        youtubeId: videoInfo?.id || null,
        videoTitle: videoInfo?.title || null,
        isVideo: isVideoScene,
        subCuts,
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
 */
export async function searchSingleSceneImages({
  query = '',
  prompt = '',
  source = 'web_video',
  tenantId = null
}) {
  let serperKey = config.serperApiKey;

  if (tenantId) {
    try {
      const vaultSnap = await db.collection('tenants').doc(tenantId).collection('credentials').doc('vault').get();
      if (vaultSnap.exists) {
        const vaultData = vaultSnap.data();
        serperKey = decryptCredential(vaultData.serperApiKey) || serperKey;
      }
    } catch (e) {}
  }

  const cleanQuery = (query || prompt || '').trim();
  let candidates = [];
  let videoInfo = null;

  if (source === 'ai_image') {
    candidates = generatePollinationsUrls(prompt || cleanQuery, 5);
  } else if (source === 'web_video') {
    const [videoResults, googleImages] = await Promise.all([
      searchWebVideoMetadata(cleanQuery, 2).catch(() => []),
      searchRealGoogleImageCandidates({
        query: cleanQuery,
        maxResults: 6,
        serperApiKey: serperKey
      }).catch(() => [])
    ]);

    if (videoResults.length > 0) {
      videoInfo = videoResults[0];
      candidates = [videoInfo.thumbnailUrl, ...googleImages].filter(Boolean);
    } else {
      candidates = googleImages.length > 0 ? googleImages : generatePollinationsUrls(prompt || cleanQuery, 4);
    }
  } else {
    candidates = await searchRealGoogleImageCandidates({
      query: cleanQuery,
      maxResults: 8,
      serperApiKey: serperKey
    });

    if (candidates.length === 0) {
      candidates = generatePollinationsUrls(prompt || cleanQuery, 4);
    }
  }

  return {
    query: cleanQuery,
    prompt: prompt || cleanQuery,
    source: videoInfo ? 'web_video' : source === 'ai_image' ? 'ai_image' : 'google_image',
    imageUrl: candidates[0] || null,
    videoUrl: videoInfo?.videoUrl || null,
    embedUrl: videoInfo?.embedUrl || null,
    youtubeId: videoInfo?.id || null,
    videoTitle: videoInfo?.title || null,
    isVideo: Boolean(videoInfo),
    alternativeUrls: candidates.slice(1)
  };
}
