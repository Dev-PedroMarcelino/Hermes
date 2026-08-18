import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega as variáveis de ambiente do .env da raiz
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const apiKey = process.env.GEMINI_API_KEY;

/**
 * Função assíncrona para gerar o roteiro de vídeo curto via Gemini API.
 */
export async function gerarRoteiroViking() {
  if (!apiKey || apiKey.startsWith('AQ.')) {
    console.warn('⚠️ Nota: A GEMINI_API_KEY no .env precisa ser uma chave válida gerada em https://aistudio.google.com/app/apikey (começa com "AIzaSy...").\n');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7
    }
  });

  const prompt = `
Você é um roteirista profissional de vídeos curtos de nicho dark para redes sociais (YouTube Shorts, TikTok, Instagram Reels e Kwai).

Gere um roteiro épico e de alta retenção de 60 segundos sobre:
- Tema: Mitologia Viking e o Ragnarök (o fim do mundo nórdico).

REGRAS RÍGIDAS DE SAÍDA:
Você DEVE retornar ESTRITAMENTE um objeto JSON válido contendo exatamente as seguintes chaves:
{
  "titulo": "Título forte e chamativo do vídeo",
  "descricao": "Descrição engajadora para a postagem com hashtags",
  "tags": ["array", "de", "hashtags", "relevantes"],
  "roteiro_locucao": "Texto completo e fluido da narração falada que será convertida em áudio sintetizado TTS. Deve conter gancho (hook) nos primeiros 3 segundos e narrativa sobre Fenrir, Jörmungandr, Odin e o apocalipse viking."
}
`;

  try {
    console.log('🤖 Solicitando geração de roteiro ao modelo Google Gemini...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    if (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not valid')) {
      console.error('\n❌ Retorno da API do Gemini: Chave API Key inválida (passe sua chave do Google AI Studio no .env).\n');
      console.log('Exibindo estrutura JSON de demonstração do Roteiro Viking:\n');
      return {
        "titulo": "O Fim dos Deuses: O Apocalipse Viking (Ragnarök)",
        "descricao": "Descubra como os vikings acreditavam que o mundo chegaria ao fim. Fenrir se libertará e os céus vão queimar! ⚔️🛡️ #mitologiaviking #ragnarok #shorts #historia",
        "tags": [
          "#mitologiaviking",
          "#ragnarok",
          "#odin",
          "#thor",
          "#shorts",
          "#curiosidades"
        ],
        "roteiro_locucao": "Você sabia que para os vikings, os próprios deuses estavam destinados a morrer? O Ragnarök não é uma profecia incerta... é uma certeza inevitável. Quando o inverno sem fim, o Fimbulwinter, congelar os nove reinos, o lobo gigante Fenrir devorará o próprio Sol. A serpente Jörmungandr emergirá dos oceanos, envenenando os céus. Odin enfrentará o lobo e será devorado. Thor matará a grande serpente, mas dará apenas nove passos antes de sucumbir ao seu veneno mortal. O fogo consumirá a árvore da vida, Yggdrasil. O mundo afundará na escuridão... para que um novo recomeço possa surgir."
      };
    }
    throw error;
  }
}

async function main() {
  try {
    const roteiro = await gerarRoteiroViking();
    console.log(JSON.stringify(roteiro, null, 2));
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

main();
