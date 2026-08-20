import test from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs-extra';
import { convertImageToMotionClip } from '../src/services/aiImageService.js';
import { probeDuration } from '../src/services/renderEngine.js';

test('Ken Burns Motion Video Converter from Image', async () => {
  const tmpDir = path.resolve('./tmp_test_motion');
  await fs.ensureDir(tmpDir);

  const sampleImgPath = path.join(tmpDir, 'test_source.png');
  const outputVideoPath = path.join(tmpDir, 'test_motion.mp4');

  // Create a minimal 1x1 PNG or small image buffer
  const minimalPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  await fs.writeFile(sampleImgPath, minimalPng);

  await convertImageToMotionClip({
    imagePath: sampleImgPath,
    outputVideoPath,
    duration: 3,
    motionIndex: 0
  });

  assert.ok(await fs.pathExists(outputVideoPath));
  const duration = await probeDuration(outputVideoPath);
  assert.ok(duration >= 2.5, `Duração esperada ~3s, obtido ${duration}`);

  // Cleanup
  await fs.remove(tmpDir);
});
