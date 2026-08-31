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
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const candidateModels = Array.from(new Set([
    primaryModel,
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.7-flash',
    'gemini-2.5-pro'
  ]));

  const prompt = `
Você é um roteirista profissional de conteúdo viral para redes sociais curtas (YouTube Shorts, TikTok, Instagram Reels).
Crie um roteiro de vídeo curto de ALTA RETENÇÃO (duração total ideal entre 30 a 50 segundos) com CORTES RÁPIDOS E DINÂMICOS A CADA 2 A 3 SEGUNDOS.

- Nicho do Canal: ${niche}
- Identidade da Marca: ${brandIdentity}
- Idioma: ${language}
${topic ? `- Tópico Específico (FOCO EXCLUSIVO): ${topic}` : '- Tópico: Escolha um tópico surpreendente, curioso e de alto engajamento dentro do nicho.'}
${instruction ? `- Orientação adicional do operador (siga à risca): ${instruction}` : ''}
${recentTitles.length ? `\nTEMAS JÁ PUBLICADOS NESTE CANAL — NÃO REPITA NENHUM DELES NEM VARIAÇÕES PRÓXIMAS:\n${recentTitles.map(t => `- ${t}`).join('\n')}` : ''}

RETORNE ESTRITAMENTE UM JSON NO SEGUINTE FORMATO JSON SCHEMA:
{
  "title": "Título chamativo do vídeo",
  "hook": "Frase de impacto inicial dos primeiros 3 segundos para prender a atenção",
  "mainVisualTheme": "Nome oficial do TEMA PRINCIPAL em inglês para pesquisar na Web (ex: se o tópico for GTA 6 -> 'GTA 6')",
  "mediaTypePreference": "web_video",
  "sections": [
    {
      "text": "Frase que será falada pela voz sintetizada nesta cena",
      "imagePrompt": "Prompt em inglês descritivo para visual",
      "visualSearchQuery": "Termo de busca em inglês específico com o tema central (ex: 'GTA 6 Vice City trailer' ou 'GTA 6 Lucia action')",
      "mediaType": "video",
      "durationEstSeconds": 7
    }
  ],
  "soundMood": "Estilo da música de fundo (ex: 'energetic dark synthwave')",
  "hashtags": ["#shorts", "#viral"]
}

REGRAS DE CONTEÚDO E ESTRUTURA:
1. ESTRUTURA NARRATIVA HÍBRIDA (4 A 6 CENAS):
   - Crie entre 4 a 6 seções narrativas bem estruturadas ('sections').
   - INTERCALE INTELIGENTEMENTE o campo 'mediaType': use 'video' para momentos de impacto/ação/revelação (≤10s) e 'image' para contextualização e detalhes rápidos (fotos com cortes de 2-3s).
   - O gancho (Cena 1) e o clímax (Cena 4 ou 5) devem preferencialmente ser 'video'. As demais cenas podem ser 'image'.
2. FOCO EXCLUSIVO NO TÓPICO:
   - Fale ÚNICA E EXCLUSIVAMENTE sobre o assunto solicitado (${topic || 'o tópico informado'}).
   - É EXTREMAMENTE PROIBIDO mencionar outros filmes, personagens ou franquias não relacionadas.
3. O campo 'hook' deve ser extremamente forte nos primeiros 3 segundos.
4. A soma do texto falado em 'sections' deve formar uma narrativa contínua e empolgante.
5. BUSCA DE MÍDIA NA WEB (RIGOROSA E PRECISA):
   - 'mainVisualTheme' deve ser o nome oficial da franquia/pessoa/tópico em inglês.
   - 'visualSearchQuery' DEVE OBRIGATORIAMENTE conter a entidade central e qualificadores descritivos reais em inglês (ex: 'GTA 6 Lucia trailer', 'GTA 6 Jason police chase', 'GTA 6 neon skyline night').
   - PROIBIDO usar queries genéricas ou em português.
6. Retorne APENAS o JSON válido. Sem formatação markdown extra fora do JSON.
`;

  let result;
  let lastError;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' }
      });
      result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout de 12s excedido para ${modelName}`)), 12000))
      ]);
      if (modelName !== primaryModel) {
        console.warn(`[Gemini] Usado modelo de fallback '${modelName}' com sucesso (modelo '${primaryModel}' falhou).`);
      }
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini] Tentativa com modelo '${modelName}' falhou: ${err.message}. Tentando próximo modelo...`);
      // Small wait to mitigate momentary spikes
      await new Promise(resolve => setTimeout(resolve, 350));
      continue;
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

  if (!scriptJson.title || !scriptJson.hook) {
    throw new Error('Roteiro do Gemini veio sem "title" ou "hook".');
  }
  if (!Array.isArray(scriptJson.sections) || scriptJson.sections.length === 0) {
    throw new Error('Roteiro do Gemini veio sem "sections".');
  }
  if (!scriptJson.mainVisualTheme) {
    scriptJson.mainVisualTheme = topic || 'GTA 6';
  }
  if (!Array.isArray(scriptJson.hashtags)) {
    scriptJson.hashtags = ['#shorts'];
  }

  return scriptJson;
}
