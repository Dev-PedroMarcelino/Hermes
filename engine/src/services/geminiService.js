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
export async function generateVideoScript({ apiKey, niche, brandIdentity, language = 'pt-BR', topic = null }) {
  const genAI = new GoogleGenerativeAI(apiKey);
  // Using gemini-1.5-flash or gemini-2.0-flash
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json'
    }
  });

  const prompt = `
Você é um roteirista profissional de conteúdo viral para redes sociais curtas (YouTube Shorts, TikTok, Instagram Reels, Kwai).
Crie um roteiro de vídeo curto de ALTA RETENÇÃO (duração total ideal entre 30 a 50 segundos).

- Nicho do Canal: ${niche}
- Identidade da Marca: ${brandIdentity}
- Idioma: ${language}
${topic ? `- Tópico Específico: ${topic}` : '- Tópico: Escolha um tópico surpreendente, curioso e de alto engajamento dentro do nicho.'}

RETORNE ESTRITAMENTE UM JSON NO SEGUINTE FORMATO JSON SCHEMA:
{
  "title": "Título chamativo do vídeo",
  "hook": "Frase de impacto inicial dos primeiros 3 segundos para prender a atenção",
  "sections": [
    {
      "text": "Texto exato que será falado pela voz sintetizada",
      "visualSearchQuery": "Keywords em inglês para buscar banco de vídeo no Pexels (ex: 'futuristic artificial intelligence robot city')",
      "durationEstSeconds": 6
    }
  ],
  "soundMood": "Estilo da música de fundo (ex: 'energetic dark synthwave')",
  "hashtags": ["#shorts", "#nicho", "#viral"]
}

REGRAS RÍGIDAS:
1. O campo 'hook' deve ser extremamente forte.
2. A soma do texto falado em 'sections' deve formar uma narrativa fluida, sem enrolação.
3. Os termos 'visualSearchQuery' DEVEM ESTAR EM INGLÊS para garantir compatibilidade com APIs de vídeo stock (ex: Pexels).
4. Retorne APENAS o JSON válido. Sem formatação markdown extra fora do JSON se possível.
`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  try {
    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const scriptJson = JSON.parse(cleanedText);
    return scriptJson;
  } catch (error) {
    throw new Error(`Failed to parse Gemini response as JSON: ${error.message}. Response was: ${responseText}`);
  }
}
