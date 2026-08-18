import { EdgeTTS } from 'node-edge-tts';
import path from 'path';
import fs from 'fs-extra';

/**
 * Synthesizes narration with Microsoft Edge's neural TTS.
 *
 * With `saveSubtitles`, Edge also returns word-level timing metadata, which we
 * read back and hand to the subtitle generator. Those are the voice's actual
 * timings, so captions stay locked to the audio instead of drifting against
 * estimated durations.
 *
 * @returns {Promise<{audioPath: string, cues: Array<{part: string, start: number, end: number}>}>}
 *          Cue times are in milliseconds.
 */
export async function generateSpeech({
  text,
  outputFilePath,
  voice = 'pt-BR-AntonioNeural',
  lang = 'pt-BR',
  rate = '+10%',
  pitch = '+0Hz',
  volume = '+0%'
}) {
  if (!text || !text.trim()) {
    throw new Error('Texto da narração está vazio.');
  }

  await fs.ensureDir(path.dirname(outputFilePath));

  const tts = new EdgeTTS({
    voice,
    lang,
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    saveSubtitles: true,
    rate,
    pitch,
    volume,
    timeout: 60000
  });

  await tts.ttsPromise(text, outputFilePath);

  if (!(await fs.pathExists(outputFilePath))) {
    throw new Error(`EdgeTTS não gerou o arquivo de áudio em ${outputFilePath}`);
  }
  const { size } = await fs.stat(outputFilePath);
  if (size === 0) {
    throw new Error('EdgeTTS gerou um arquivo de áudio vazio.');
  }

  // Edge writes the timings alongside the audio as "<audioPath>.json"
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
