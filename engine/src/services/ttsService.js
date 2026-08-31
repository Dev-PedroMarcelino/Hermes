import { EdgeTTS } from 'node-edge-tts';
import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';

/**
 * Sanitizes text to remove characters that can break SSML / Edge TTS WebSockets / APIs.
 */
function sanitizeText(text) {
  return text
    .replace(/&/g, 'e')
    .replace(/</g, '')
    .replace(/>/g, '')
    .replace(/"/g, '')
    .trim();
}

/**
 * Transforms character-level alignment from ElevenLabs into word cues with timing in milliseconds.
 */
function buildCuesFromElevenLabsAlignment(alignment) {
  if (!alignment || !Array.isArray(alignment.characters)) return [];
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;
  const cues = [];
  let currentWord = '';
  let wordStart = null;
  let wordEnd = null;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const startSec = character_start_times_seconds?.[i] ?? 0;
    const endSec = character_end_times_seconds?.[i] ?? (startSec + 0.05);

    if (/\s/.test(char)) {
      if (currentWord) {
        cues.push({
          part: currentWord,
          start: Math.round((wordStart ?? 0) * 1000),
          end: Math.round((wordEnd ?? 0) * 1000)
        });
        currentWord = '';
        wordStart = null;
        wordEnd = null;
      }
    } else {
      if (wordStart === null) wordStart = startSec;
      wordEnd = endSec;
      currentWord += char;
    }
  }

  if (currentWord) {
    cues.push({
      part: currentWord,
      start: Math.round((wordStart ?? 0) * 1000),
      end: Math.round((wordEnd ?? 0) * 1000)
    });
  }

  return cues;
}

/**
 * Synthesizes speech using ElevenLabs API.
 */
async function generateSpeechElevenLabs({ text, outputFilePath, voiceId, apiKey, modelId = 'eleven_multilingual_v2' }) {
  console.log(`[TTS] Gerando áudio via ElevenLabs (Voice ID: '${voiceId}')...`);

  // 1. Try with-timestamps endpoint for exact word alignment
  try {
    const res = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
      {
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    if (res.data && res.data.audio_base64) {
      const audioBuffer = Buffer.from(res.data.audio_base64, 'base64');
      await fs.writeFile(outputFilePath, audioBuffer);
      const cues = buildCuesFromElevenLabsAlignment(res.data.alignment);
      await fs.writeJson(`${outputFilePath}.json`, cues).catch(() => {});
      console.log(`[TTS] Áudio sintetizado com sucesso via ElevenLabs (${(audioBuffer.length / 1024).toFixed(1)} KB) com ${cues.length} marcações.`);
      return { audioPath: outputFilePath, cues };
    }
  } catch (err) {
    console.warn(`[TTS] Endpoint with-timestamps ElevenLabs falhou (${err.message}). Tentando endpoint padrão...`);
  }

  // 2. Fallback to standard binary audio endpoint
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      responseType: 'arraybuffer',
      timeout: 60000
    }
  );

  const audioBuffer = Buffer.from(response.data);
  await fs.writeFile(outputFilePath, audioBuffer);
  console.log(`[TTS] Áudio sintetizado com sucesso via ElevenLabs (Standard MP3) (${(audioBuffer.length / 1024).toFixed(1)} KB).`);
  return { audioPath: outputFilePath, cues: [] };
}

/**
 * Synthesizes narration with Microsoft Edge's neural TTS or ElevenLabs.
 *
 * Includes automatic retry logic with exponential backoff and fallback voices.
 *
 * @returns {Promise<{audioPath: string, cues: Array<{part: string, start: number, end: number}>}>}
 *          Cue times are in milliseconds.
 */
export async function generateSpeech({
  text,
  outputFilePath,
  provider = 'edge',
  voice = 'pt-BR-AntonioNeural',
  elevenlabsApiKey = null,
  lang = 'pt-BR',
  rate = '+10%',
  pitch = '+0Hz',
  volume = '+0%'
}) {
  const cleanText = sanitizeText(text);
  if (!cleanText) {
    throw new Error('Texto da narração está vazio.');
  }

  await fs.ensureDir(path.dirname(outputFilePath));

  // If provider is elevenlabs OR voice starts with elevenlabs: or looks like custom voice ID
  const isElevenLabs = provider === 'elevenlabs' || voice.startsWith('elevenlabs:') || (elevenlabsApiKey && !voice.includes('Neural'));
  if (isElevenLabs) {
    if (!elevenlabsApiKey) {
      console.warn(`[TTS] Provedor ElevenLabs selecionado (Voz: '${voice}'), mas a chave ELEVENLABS_API_KEY não foi encontrada no motor nem no vault. Caindo de volta para o EdgeTTS...`);
    } else {
      const cleanVoiceId = voice.replace(/^elevenlabs:/, '').trim();
      try {
        return await generateSpeechElevenLabs({
          text: cleanText,
          outputFilePath,
          voiceId: cleanVoiceId,
          apiKey: elevenlabsApiKey
        });
      } catch (err) {
        console.warn(`[TTS] Síntese ElevenLabs falhou (${err.message}). Caindo de volta para o EdgeTTS como emergência...`);
      }
    }
  }

  const voicesToTry = [
    voice,
    'pt-BR-AntonioNeural',
    'pt-BR-FranciscaNeural',
    'pt-BR-ThalitaNeural'
  ].filter((v, idx, self) => Boolean(v) && self.indexOf(v) === idx);

  let lastError = null;

  for (const currentVoice of voicesToTry) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[TTS] Gerando áudio com a voz '${currentVoice}' (tentativa ${attempt}/3)...`);
        
        // Remove stale previous output if retrying
        await fs.remove(outputFilePath).catch(() => {});
        await fs.remove(`${outputFilePath}.json`).catch(() => {});

        const tts = new EdgeTTS({
          voice: currentVoice,
          lang,
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
          saveSubtitles: true,
          rate,
          pitch,
          volume,
          timeout: 45000
        });

        await tts.ttsPromise(cleanText, outputFilePath);

        if (await fs.pathExists(outputFilePath)) {
          const { size } = await fs.stat(outputFilePath);
          if (size > 1000) {
            console.log(`[TTS] Áudio sintetizado com sucesso com '${currentVoice}' (${(size / 1024).toFixed(1)} KB)`);
            
            // Read timing cues generated alongside audio
            let cues = [];
            const cuesPath = `${outputFilePath}.json`;
            try {
              if (await fs.pathExists(cuesPath)) {
                cues = await fs.readJson(cuesPath);
              }
            } catch (err) {
              console.warn('[TTS] Não foi possível ler as marcações de tempo:', err.message);
            }

            return { audioPath: outputFilePath, cues };
          }
        }
      } catch (err) {
        lastError = err;
        console.warn(`[TTS] Tentativa ${attempt} com a voz '${currentVoice}' falhou: ${err.message}`);
        // Wait before retrying
        await new Promise(r => setTimeout(r, attempt * 1500));
      }
    }
  }

  throw lastError || new Error('Não foi possível sintetizar a narração com NENHUMA voz do EdgeTTS.');
}

