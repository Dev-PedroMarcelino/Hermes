import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs-extra';
import { spawnSync } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import { generateAssSubtitles } from '../src/services/subtitleService.js';
import { renderFinalVideo, probeDuration } from '../src/services/renderEngine.js';

/**
 * Offline validation of the subtitle + render stages.
 *
 * Uses a locally synthesized audio track and locally synthesized background
 * clips instead of Edge TTS and Pexels, so it runs with no network access and
 * no credentials — the parts of the pipeline that are pure FFmpeg get proven
 * on every run.
 */

const WORK_DIR = path.resolve('./tmp_test_render');

/** Creates a short audio file locally so the test needs no TTS service. */
function makeToneAudio(outputPath, seconds) {
  const result = spawnSync(
    ffmpegStatic,
    ['-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:a', 'libmp3lame', outputPath],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`Falha ao gerar áudio de teste: ${result.stderr?.slice(-500)}`);
}

/** Creates a colored background clip locally so the test needs no Pexels. */
function makeColorClip(outputPath, color, seconds) {
  const result = spawnSync(
    ffmpegStatic,
    [
      '-y', '-f', 'lavfi',
      '-i', `color=c=${color}:s=720x1280:r=30:d=${seconds}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      outputPath
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) throw new Error(`Falha ao gerar clipe de teste: ${result.stderr?.slice(-500)}`);
}

const CUES = [
  { part: 'Você', start: 0, end: 500 },
  { part: 'não', start: 500, end: 900 },
  { part: 'vai', start: 900, end: 1300 },
  { part: 'acreditar', start: 1300, end: 2100 },
  { part: 'nisso', start: 2100, end: 3000 },
  { part: 'agora', start: 3000, end: 4000 }
];

test('legendas .ass usam as marcações reais de tempo', async t => {
  await fs.ensureDir(WORK_DIR);
  t.after(async () => fs.remove(WORK_DIR));

  const assPath = path.join(WORK_DIR, 'subs.ass');
  await generateAssSubtitles({
    sections: [{ text: 'Você não vai acreditar nisso agora' }],
    cues: CUES,
    outputAssPath: assPath,
    totalDurationSeconds: 4
  });

  const content = await fs.readFile(assPath, 'utf8');
  assert.ok(content.includes('PlayResX: 1080'), 'deve usar resolução vertical');
  assert.ok(content.includes('ACREDITAR'), 'deve conter as palavras da narração');

  // Every cue produces one highlighted line
  const dialogueLines = content.split('\n').filter(l => l.startsWith('Dialogue:'));
  assert.strictEqual(dialogueLines.length, CUES.length, 'uma linha por palavra marcada');

  // The last cue ends at 4.0s, so no subtitle may run past the narration
  assert.ok(!content.includes('0:00:05.'), 'nenhuma legenda deve passar da narração');
});

test('render sem clipes gera mp4 com fundo sólido', async t => {
  await fs.ensureDir(WORK_DIR);
  t.after(async () => fs.remove(WORK_DIR));

  const audioPath = path.join(WORK_DIR, 'tone.mp3');
  const assPath = path.join(WORK_DIR, 'subs.ass');
  const videoPath = path.join(WORK_DIR, 'solid.mp4');

  makeToneAudio(audioPath, 4);
  await generateAssSubtitles({
    sections: [{ text: 'Você não vai acreditar nisso agora' }],
    cues: CUES,
    outputAssPath: assPath,
    totalDurationSeconds: 4
  });

  await renderFinalVideo({ videoClips: [], audioPath, assSubtitlePath: assPath, outputVideoPath: videoPath });

  assert.ok(await fs.pathExists(videoPath));
  const { size } = await fs.stat(videoPath);
  assert.ok(size > 10000, `mp4 deve ter conteúdo real, obtido ${size} bytes`);

  const duration = await probeDuration(videoPath);
  assert.ok(Math.abs(duration - 4.5) < 1, `duração esperada ~4.5s, obtida ${duration}s`);
});

test('render concatena múltiplos clipes de fundo em 1080x1920', async t => {
  await fs.ensureDir(WORK_DIR);
  t.after(async () => fs.remove(WORK_DIR));

  const audioPath = path.join(WORK_DIR, 'tone2.mp3');
  const assPath = path.join(WORK_DIR, 'subs2.ass');
  const videoPath = path.join(WORK_DIR, 'multi.mp4');
  const clipA = path.join(WORK_DIR, 'a.mp4');
  const clipB = path.join(WORK_DIR, 'b.mp4');

  makeToneAudio(audioPath, 6);
  makeColorClip(clipA, 'red', 2);
  makeColorClip(clipB, 'blue', 2);

  await generateAssSubtitles({
    sections: [{ text: 'Você não vai acreditar nisso agora' }],
    cues: CUES,
    outputAssPath: assPath,
    totalDurationSeconds: 6
  });

  await renderFinalVideo({
    videoClips: [clipA, clipB],
    audioPath,
    assSubtitlePath: assPath,
    outputVideoPath: videoPath
  });

  const { size } = await fs.stat(videoPath);
  assert.ok(size > 10000, 'mp4 concatenado deve ter conteúdo real');

  // Confirm the output really is a 1080x1920 vertical video with audio
  const probe = spawnSync(
    ffmpegStatic.replace('ffmpeg.exe', 'ffmpeg.exe'),
    ['-i', videoPath, '-hide_banner'],
    { encoding: 'utf8' }
  );
  const info = probe.stderr || '';
  assert.ok(info.includes('1080x1920'), `saída deve ser 1080x1920, stderr: ${info.slice(-400)}`);
  assert.ok(/Stream .*Audio: aac/.test(info), 'saída deve conter faixa de áudio AAC');

  const duration = await probeDuration(videoPath);
  assert.ok(Math.abs(duration - 6.5) < 1, `duração esperada ~6.5s, obtida ${duration}s`);
});
