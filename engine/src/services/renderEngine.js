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
 * Renders the final 1080x1920 vertical video: background clips + TTS narration
 * + burned-in animated subtitles.
 *
 * Every background clip is scaled, cropped and concatenated so the visuals
 * actually change across the video. The previous version added each clip as a
 * separate input but never concatenated them, so only the first clip was ever
 * visible and the audio stream mapping was left to chance.
 *
 * @returns {Promise<string>} Path to the rendered MP4
 */
export async function renderFinalVideo({
  videoClips = [],
  audioPath,
  assSubtitlePath,
  outputVideoPath
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
  // Give the render a small tail so the last subtitle is not clipped
  const targetDuration = narrationDuration + 0.5;

  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    const filters = [];
    let videoLabel;

    if (usableClips.length === 0) {
      // No stock footage: synthesize a solid branded background of the right length
      command.input(`color=c=0x0f0f1a:s=1080x1920:r=30:d=${targetDuration.toFixed(2)}`);
      command.inputOptions(['-f', 'lavfi']);
      videoLabel = '0:v';
    } else {
      usableClips.forEach(clip => {
        // Loop each clip so a short stock file can still fill its slot
        command.input(clip).inputOptions(['-stream_loop', '-1']);
      });

      // Split the narration evenly across the available clips
      const perClip = targetDuration / usableClips.length;

      usableClips.forEach((_, index) => {
        filters.push(
          `[${index}:v]trim=duration=${perClip.toFixed(3)},setpts=PTS-STARTPTS,` +
            `scale=1080:1920:force_original_aspect_ratio=increase,` +
            `crop=1080:1920,setsar=1,fps=30[v${index}]`
        );
      });

      if (usableClips.length === 1) {
        videoLabel = '[v0]';
      } else {
        const concatInputs = usableClips.map((_, index) => `[v${index}]`).join('');
        filters.push(`${concatInputs}concat=n=${usableClips.length}:v=1:a=0[vconcat]`);
        videoLabel = '[vconcat]';
      }
    }

    // Narration is always the last input
    command.input(audioPath);
    const audioInputIndex = usableClips.length === 0 ? 1 : usableClips.length;

    if (hasSubtitles) {
      const source = videoLabel.startsWith('[') ? videoLabel : `[${videoLabel}]`;
      filters.push(`${source}ass='${escapeFilterPath(assSubtitlePath)}'[vout]`);
      videoLabel = '[vout]';
    }

    if (filters.length > 0) {
      command.complexFilter(filters);
      command.outputOptions(['-map', videoLabel]);
    } else {
      command.outputOptions(['-map', '0:v']);
    }

    command
      .outputOptions([
        '-map', `${audioInputIndex}:a`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '44100',
        '-pix_fmt', 'yuv420p',
        // Fast-start moves the moov atom to the front so platforms can stream it
        '-movflags', '+faststart',
        '-t', targetDuration.toFixed(2)
      ])
      .output(outputVideoPath)
      .on('start', commandLine => {
        console.log('[RenderEngine] FFmpeg:', commandLine);
      })
      .on('progress', progress => {
        if (progress.percent) {
          console.log(`[RenderEngine] Renderizando: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', async () => {
        const exists = await fs.pathExists(outputVideoPath);
        const size = exists ? (await fs.stat(outputVideoPath)).size : 0;
        if (!size) {
          return reject(new Error(`FFmpeg terminou mas o arquivo saiu vazio: ${outputVideoPath}`));
        }
        console.log(`[RenderEngine] Concluído: ${outputVideoPath} (${(size / 1024 / 1024).toFixed(2)} MB)`);
        resolve(outputVideoPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[RenderEngine] Erro FFmpeg:', err.message);
        if (stderr) console.error('[RenderEngine] stderr:', stderr.slice(-2000));
        reject(new Error(`Falha na renderização FFmpeg: ${err.message}`));
      })
      .run();
  });
}
