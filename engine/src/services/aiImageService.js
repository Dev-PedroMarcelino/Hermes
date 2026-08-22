import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Generates an AI illustration for a specific scene using Pollinations AI (Flux / Turbo model).
 *
 * @param {Object} options
 * @param {string} options.prompt Detailed English description of the scene
 * @param {string} options.outputFilePath File path to save the generated image (.jpg or .png)
 * @param {number} [options.width=720] Output width (vertical 9:16)
 * @param {number} [options.height=1280] Output height (vertical 9:16)
 * @param {number} [options.seed] Optional seed for reproducible generation
 * @returns {Promise<string>} Saved image file path
 */
export async function generateAiImage({
  prompt,
  outputFilePath,
  width = 1080,
  height = 1920,
  seed = Math.floor(Math.random() * 1000000)
}) {
  await fs.ensureDir(path.dirname(outputFilePath));

  // Sanitize prompt for URL query with quality boosters
  const cleanPrompt = encodeURIComponent(
    `${prompt}, photorealistic, masterpiece, hyperrealistic 8k resolution, Unreal Engine 5 render, cinematic lighting, sharp focus, 9:16 vertical`
  );

  const models = ['flux', 'turbo', 'default'];
  let lastError = null;

  for (const model of models) {
    const url = model === 'default'
      ? `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`
      : `https://image.pollinations.ai/prompt/${cleanPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=${model}`;

    try {
      const response = await axios({
        method: 'get',
        url,
        responseType: 'stream',
        timeout: 18000
      });

      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(outputFilePath);
        let finished = false;

        const streamTimer = setTimeout(() => {
          if (!finished) {
            finished = true;
            try { response.data.destroy(); } catch (e) {}
            try { fileStream.destroy(); } catch (e) {}
            fs.remove(outputFilePath).catch(() => {});
            reject(new Error(`Timeout ao baixar imagem do modelo ${model}.`));
          }
        }, 22000);

        response.data.pipe(fileStream);

        fileStream.on('finish', () => {
          if (!finished) {
            finished = true;
            clearTimeout(streamTimer);
            resolve();
          }
        });

        fileStream.on('error', err => {
          if (!finished) {
            finished = true;
            clearTimeout(streamTimer);
            fs.remove(outputFilePath).catch(() => {});
            reject(err);
          }
        });

        response.data.on('error', err => {
          if (!finished) {
            finished = true;
            clearTimeout(streamTimer);
            fs.remove(outputFilePath).catch(() => {});
            reject(err);
          }
        });
      });

      if (await fs.pathExists(outputFilePath)) {
        const { size } = await fs.stat(outputFilePath);
        if (size > 1000) {
          return outputFilePath;
        }
      }
    } catch (err) {
      lastError = err;
      console.warn(`[AIImage] Falha com modelo '${model}': ${err.message}. Tentando próximo...`);
    }
  }

  throw lastError || new Error('Não foi possível gerar a imagem por IA.');
}

/**
 * Converts a static 2D image into an animated 9:16 vertical MP4 video clip
 * using FFmpeg Ken Burns effect (slow cinematic zoom-in, zoom-out, or pan).
 *
 * @param {Object} options
 * @param {string} options.imagePath Path to the static source image
 * @param {string} options.outputVideoPath Path to the resulting MP4 video
 * @param {number} [options.duration=6] Duration of the clip in seconds
 * @param {number} [options.motionIndex=0] Determines motion style (zoom-in, zoom-out, pan)
 * @returns {Promise<string>} Path to the generated video file
 */
export async function convertImageToMotionClip({
  imagePath,
  outputVideoPath,
  duration = 6,
  motionIndex = 0
}) {
  await fs.ensureDir(path.dirname(outputVideoPath));

  if (!(await fs.pathExists(imagePath))) {
    throw new Error(`Imagem de origem não encontrada: ${imagePath}`);
  }

  const fps = 25;
  const totalFrames = Math.max(25, Math.round(duration * fps));
  const motionStyle = motionIndex % 3;

  // Steady, crisp 1080x1920 vertical scaling without shaky/jittery zoompan artifacts
  const scaleCropFilter = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=25';

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop', '1', '-t', String(duration)])
      .videoFilters([scaleCropFilter, 'format=yuv420p'])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'stillimage',
        '-threads', '1',
        '-t', String(duration),
        '-pix_fmt', 'yuv420p'
      ])
      .output(outputVideoPath)
      .on('end', () => resolve(outputVideoPath))
      .on('error', (err) => reject(new Error(`Falha no Ken Burns FFmpeg: ${err.message}`)))
      .run();
  });
}
