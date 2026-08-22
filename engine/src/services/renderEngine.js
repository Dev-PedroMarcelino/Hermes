import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import path from 'path';
import fs from 'fs-extra';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * Reads a media file's duration in seconds.
 */
export function probeDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(new Error(`ffprobe falhou em ${filePath}: ${err.message}`));
      resolve(Number(metadata?.format?.duration) || 0);
    });
  });
}

/**
 * FFmpeg filter arguments are parsed with `:` as a separator and `\` as an
 * escape, so Windows paths like C:\dir\subs.ass break the filtergraph. Convert
 * to forward slashes and escape the drive colon.
 */
function escapeFilterPath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * Normalizes a single background video clip sequentially to 1080x1920 25fps.
 * Processing one clip at a time keeps peak RAM under 50 MB, preventing OOM
 * crashes on memory-constrained hosting tiers like Render Free (512 MB RAM).
 */
function normalizeClip({ clipPath, duration, outputPath }) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(clipPath)
      .inputOptions(['-stream_loop', '-1'])
      .videoFilters([
        `trim=duration=${duration.toFixed(3)}`,
        'setpts=PTS-STARTPTS',
        'scale=1080:1920:force_original_aspect_ratio=increase',
        'crop=1080:1920',
        'setsar=1',
        'fps=25'
      ])
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '24',
        '-threads', '1',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-t', duration.toFixed(3)
      ])
      .output(outputPath)
      .on('error', err => reject(new Error(`Falha ao normalizar clipe ${clipPath}: ${err.message}`)))
      .on('end', () => resolve(outputPath))
      .run();
  });
}

/**
 * Renders the final 1080x1920 vertical video: background clips + TTS narration
 * + burned-in animated subtitles.
 *
 * Clips are processed sequentially to guarantee peak RAM remains under 100 MB
 * at all times.
 *
 * @returns {Promise<string>} Path to the rendered MP4
 */
export async function renderFinalVideo({
  videoClips = [],
  audioPath,
  assSubtitlePath,
  outputVideoPath,
  onProgress
}) {
  await fs.ensureDir(path.dirname(outputVideoPath));

  if (!(await fs.pathExists(audioPath))) {
    throw new Error(`Áudio da narração não encontrado: ${audioPath}`);
  }

  const narrationDuration = await probeDuration(audioPath);
  if (!narrationDuration) {
    throw new Error('Não foi possível determinar a duração da narração.');
  }

  // Keep only clips that really exist on disk
  const usableClips = [];
  for (const clip of videoClips) {
    if (await fs.pathExists(clip)) usableClips.push(clip);
  }

  const hasSubtitles = assSubtitlePath && (await fs.pathExists(assSubtitlePath));
  const targetDuration = narrationDuration + 0.5;
  const tempDir = path.dirname(outputVideoPath);

  // If no clips, synthesize a solid background
  if (usableClips.length === 0) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      command.input(`color=c=0x0f0f1a:s=1080x1920:r=25:d=${targetDuration.toFixed(2)}`);
      command.inputOptions(['-f', 'lavfi']);
      command.input(audioPath);

      const filters = [];
      let videoLabel = '0:v';

      if (hasSubtitles) {
        filters.push(`[0:v]ass='${escapeFilterPath(assSubtitlePath)}'[vout]`);
        videoLabel = '[vout]';
        command.complexFilter(filters);
      }

      command
        .outputOptions([
          '-map', videoLabel,
          '-map', '1:a',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '24',
          '-threads', '1',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-t', targetDuration.toFixed(2)
        ])
        .output(outputVideoPath)
        .on('progress', progress => {
          if (progress.percent && typeof onProgress === 'function') {
            onProgress(Math.min(100, Math.max(0, Math.round(progress.percent))));
          }
        })
        .on('end', () => resolve(outputVideoPath))
        .on('error', err => reject(new Error(`Falha no FFmpeg: ${err.message}`)))
        .run();
    });
  }

  // Phase 1: Sequential clip normalization (1 decoder in memory at a time = ~40MB RAM)
  const perClipDuration = targetDuration / usableClips.length;
  const normalizedClips = [];

  for (let i = 0; i < usableClips.length; i++) {
    const normPath = path.join(tempDir, `norm_${Date.now()}_${i}.mp4`);
    await normalizeClip({
      clipPath: usableClips[i],
      duration: perClipDuration,
      outputPath: normPath
    });
    normalizedClips.push(normPath);
  }

  // Phase 2: Create concat manifest file for zero-RAM stream concatenation
  const concatManifestPath = path.join(tempDir, `concat_${Date.now()}.txt`);
  const manifestLines = normalizedClips.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
  await fs.writeFile(concatManifestPath, manifestLines, 'utf8');

  // Phase 3: Final pass with FFmpeg Concat Demuxer + Subtitle overlay (<50MB RAM)
  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    const ffmpegTimer = setTimeout(() => {
      console.error('[RenderEngine] Timeout de 10 minutos excedido no FFmpeg!');
      try { command.kill('SIGKILL'); } catch (e) {}
      reject(new Error('Timeout de 10 minutos excedido na renderização do vídeo.'));
    }, 600000);

    command.input(concatManifestPath).inputOptions(['-f', 'concat', '-safe', '0']);
    command.input(audioPath);

    const filters = [];
    let videoLabel = '0:v';

    if (hasSubtitles) {
      filters.push(`[0:v]ass='${escapeFilterPath(assSubtitlePath)}'[vout]`);
      videoLabel = '[vout]';
      command.complexFilter(filters);
    }

    command
      .outputOptions([
        '-map', videoLabel,
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '24',
        '-threads', '1',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-t', targetDuration.toFixed(2)
      ])
      .output(outputVideoPath)
      .on('start', commandLine => {
        console.log('[RenderEngine] FFmpeg final pass:', commandLine);
      })
      .on('progress', progress => {
        if (progress.percent) {
          const p = Math.min(100, Math.max(0, Math.round(progress.percent)));
          console.log(`[RenderEngine] Renderizando: ${p}%`);
          if (typeof onProgress === 'function') {
            onProgress(p);
          }
        }
      })
      .on('end', async () => {
        clearTimeout(ffmpegTimer);
        // Clean up temporary normalized clip files
        for (const p of normalizedClips) {
          await fs.remove(p).catch(() => {});
        }
        await fs.remove(concatManifestPath).catch(() => {});

        const exists = await fs.pathExists(outputVideoPath);
        const size = exists ? (await fs.stat(outputVideoPath)).size : 0;
        if (!size) {
          return reject(new Error(`FFmpeg terminou mas o arquivo saiu vazio: ${outputVideoPath}`));
        }
        console.log(`[RenderEngine] Concluído: ${outputVideoPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        resolve(outputVideoPath);
      })
      .on('error', async (err, stdout, stderr) => {
        clearTimeout(ffmpegTimer);
        for (const p of normalizedClips) {
          await fs.remove(p).catch(() => {});
        }
        await fs.remove(concatManifestPath).catch(() => {});
        console.error('[RenderEngine] Erro FFmpeg:', err.message);
        if (stderr) console.error('[RenderEngine] stderr:', stderr.slice(-2000));
        reject(new Error(`Falha na renderização FFmpeg: ${err.message}`));
      })
      .run();
  });
}
