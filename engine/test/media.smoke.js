import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs-extra';
import { generateSpeech } from '../src/services/ttsService.js';
import { generateAssSubtitles } from '../src/services/subtitleService.js';
import { renderFinalVideo, probeDuration } from '../src/services/renderEngine.js';
import { measureClockSkew } from '../src/config/preflight.js';

/**
 * End-to-end media smoke test: narration -> timed subtitles -> rendered MP4.
 *
 * Requires network access — Edge TTS is an online service — and takes ~30s.
 * It is skipped when the machine clock is too far off, because the Edge TTS
 * `Sec-MS-GEC` token is time-derived and the service answers 403 instead.
 * The FFmpeg stages are covered without network by render.offline.test.js.
 */

const WORK_DIR = path.resolve('./tmp_test_media');
const skew = await measureClockSkew();
const clockIsBad = skew !== null && Math.abs(skew) > 3 * 60 * 1000;

const SECTIONS = [
  { text: 'Você não vai acreditar no que essa inteligência artificial consegue fazer.' },
  { text: 'Ela transforma uma ideia simples em um vídeo completo em poucos segundos.' }
];

test('pipeline de mídia: narração, legendas e render', {
  skip: clockIsBad
    ? `relógio do sistema fora de sincronia (~${Math.round(skew / 60000)} min) — o Edge TTS recusa o token`
    : false
}, async t => {
  await fs.ensureDir(WORK_DIR);
  t.after(async () => fs.remove(WORK_DIR));

  const audioPath = path.join(WORK_DIR, 'speech.mp3');
  const assPath = path.join(WORK_DIR, 'subtitles.ass');
  const videoPath = path.join(WORK_DIR, 'final.mp4');

  // 1. Narration
  const { cues } = await generateSpeech({
    text: SECTIONS.map(s => s.text).join(' '),
    outputFilePath: audioPath
  });

  assert.ok(await fs.pathExists(audioPath), 'o mp3 da narração deve existir');
  const audioDuration = await probeDuration(audioPath);
  assert.ok(audioDuration > 1, `duração do áudio deve ser > 1s, obtido ${audioDuration}`);
  assert.ok(cues.length > 0, 'o Edge TTS deve retornar marcações de tempo');

  // 2. Subtitles built from the real voice timings
  await generateAssSubtitles({
    sections: SECTIONS,
    cues,
    outputAssPath: assPath,
    totalDurationSeconds: audioDuration
  });

  const assContent = await fs.readFile(assPath, 'utf8');
  assert.ok(assContent.includes('PlayResX: 1080'), 'legendas devem usar resolução vertical');
  assert.ok(assContent.includes('Dialogue:'), 'legendas devem ter linhas de diálogo');

  // 3. Render (no stock clips -> solid background path)
  await renderFinalVideo({
    videoClips: [],
    audioPath,
    assSubtitlePath: assPath,
    outputVideoPath: videoPath
  });

  assert.ok(await fs.pathExists(videoPath), 'o mp4 final deve existir');
  const { size } = await fs.stat(videoPath);
  assert.ok(size > 10000, `o mp4 deve ter conteúdo real, obtido ${size} bytes`);

  const videoDuration = await probeDuration(videoPath);
  assert.ok(
    Math.abs(videoDuration - audioDuration) < 2,
    `duração do vídeo (${videoDuration}s) deve acompanhar a narração (${audioDuration}s)`
  );
});
