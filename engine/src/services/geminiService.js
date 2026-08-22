import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Generates a structured JSON short-video script using Gemini API.
 * @param {Object} options
 * @param {string} options.apiKey Gemini API Key
 * @param {string} options.niche Channel Niche (e.g. "Tech & AI Curiosities")
 * @param {string} options.brandIdentity Brand tone & style
 * @param {string} options.language Language (default: "pt-BR")
 * @returns {Promise<Object>} Structured script JSON
 */
export async function generateVideoScript({
  apiKey,
  niche,
  brandIdentity,
  language = 'pt-BR',
  topic = null,
  instruction = null,
  recentTitles = []
}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const candidateModels = Array.from(new Set([
    primaryModel,
    'gemini-2.0-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ]));

  const prompt = `
Você é um roteirista profissional de conteúdo viral para redes sociais curtas (YouTube Shorts, TikTok, Instagram Reels).
Crie um roteiro de vídeo curto de ALTA RETENÇÃO (duração total ideal entre 30 a 50 segundos).

- Nicho do Canal: ${niche}
- Identidade da Marca: ${brandIdentity}
- Idioma: ${language}
${topic ? `- Tópico Específico: ${topic}` : '- Tópico: Escolha um tópico surpreendente, curioso e de alto engajamento dentro do nicho.'}
${instruction ? `- Orientação adicional do operador (siga à risca): ${instruction}` : ''}
${recentTitles.length ? `\nTEMAS JÁ PUBLICADOS NESTE CANAL — NÃO REPITA NENHUM DELES NEM VARIAÇÕES PRÓXIMAS:\n${recentTitles.map(t => `- ${t}`).join('\n')}` : ''}

RETORNE ESTRITAMENTE UM JSON NO SEGUINTE FORMATO JSON SCHEMA:
{
  "title": "Título chamativo do vídeo",
  "hook": "Frase de impacto inicial dos primeiros 3 segundos para prender a atenção",
  "mainVisualTheme": "Palavras-chave em inglês representando o TEMA VISUAL PRINCIPAL do vídeo (ex: 'GTA 6 Vice City official screenshot')",
  "mediaTypePreference": "google_image",
  "sections": [
    {
      "text": "Texto exato que será falado pela voz sintetizada",
      "imagePrompt": "Prompt em inglês altamente realista e descritivo para gerar arte 8k por IA (ex para GTA 6: 'Grand Theft Auto VI Lucia and Jason Vice City Miami ocean drive sunset 8k')",
      "visualSearchQuery": "Keywords em inglês EXTREMAMENTE ESPECÍFICAS para buscar fotos/screenshots REAIS no Google (ex para GTA 6: 'GTA 6 Vice City Lucia Jason screenshot' ou 'GTA 6 official trailer 4k')",
      "durationEstSeconds": 6
    }
  ],
  "soundMood": "Estilo da música de fundo (ex: 'energetic dark synthwave')",
  "hashtags": ["#shorts", "#nicho", "#viral"]
}

REGRAS RÍGIDAS DE CONTEÚDO E VISUAIS:
1. O campo 'hook' deve ser extremamente forte nos primeiros 3 segundos.
2. A soma do texto falado em 'sections' deve formar uma narrativa fluida.
3. CRÍTICO PARA AS IMAGENS E MÍDIA:
   - Defina 'mediaTypePreference' como 'google_image' para buscar imagens REAIS no Google correspondentes ao tema do vídeo (ex: fotos/screenshots do GTA 6, trailers, logos, personagens reais).
   - Se o operador pedir explicitamente 'stock_video' ou 'ai_image', respeite a preferência solicitada.
4. Retorne APENAS o JSON válido. Sem formatação markdown extra fora do JSON.
`;

  let result;
  let lastError;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' }
      });
      result = await model.generateContent(prompt);
      if (modelName !== primaryModel) {
        console.warn(`[Gemini] Usado modelo de fallback '${modelName}' com sucesso (modelo '${primaryModel}' falhou).`);
      }
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const isNotFound = err.message?.includes('404') || err.message?.includes('not found') || err.message?.includes('no longer available');
      if (isNotFound) {
        console.warn(`[Gemini] Modelo '${modelName}' não encontrado no Gemini API (404). Tentando próximo modelo...`);
        continue;
      }
      throw err;
    }
  }

  if (lastError || !result) {
    throw lastError || new Error('Nenhum modelo Gemini disponível respondeu à requisição.');
  }

  const responseText = result.response.text();

  let scriptJson;
  try {
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    scriptJson = JSON.parse(cleanedText);
  } catch (error) {
    throw new Error(`Resposta do Gemini não é JSON válido: ${error.message}. Resposta: ${responseText.slice(0, 500)}`);
  }

  // Downstream stages (TTS, subtitles, render) all assume these exist — fail
  // here with a clear message rather than midway through rendering.
  if (!scriptJson.title || !scriptJson.hook) {
    throw new Error('Roteiro do Gemini veio sem "title" ou "hook".');
  }
  if (!Array.isArray(scriptJson.sections) || scriptJson.sections.length === 0) {
    throw new Error('Roteiro do Gemini veio sem "sections".');
  }
  if (!scriptJson.mainVisualTheme) {
    scriptJson.mainVisualTheme = topic ? `${topic} cinematic stock background` : 'abstract background';
  }
  if (!Array.isArray(scriptJson.hashtags)) {
    scriptJson.hashtags = ['#shorts'];
  }

  return scriptJson;
}
