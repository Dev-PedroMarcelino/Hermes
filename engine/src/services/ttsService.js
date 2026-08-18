import { MsEdgeTTS, OUTPUT_FORMAT } from 'node-edge-tts';
import path from 'path';
import fs from 'fs-extra';

/**
 * Synthesizes text into MP3 audio using Microsoft Edge TTS.
 * @param {Object} options
 * @param {string} options.text Full text script to convert to speech
 * @param {string} options.outputFilePath Output file path for MP3
 * @param {string} options.voice Voice name (e.g., 'pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural')
 * @param {string} options.rate Speed adjustment (e.g. '+10%', '+0%')
 * @returns {Promise<string>} Output MP3 file path
 */
export async function generateSpeech({
  text,
  outputFilePath,
  voice = 'pt-BR-AntonioNeural',
  rate = '+10%'
}) {
  const dir = path.dirname(outputFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  // Synthesize audio to output stream/file
  const filePath = await tts.toFile(outputFilePath, text, {
    rate: rate,
    pitch: '+0Hz',
    volume: '+0%'
  });

  return filePath;
}
