import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs-extra';

/**
 * Renders the final vertical video (1080x1920) combining background videos, TTS audio, and ASS subtitles.
 * @param {Object} options
 * @param {Array<string>} options.videoClips Paths to downloaded background video MP4s
 * @param {string} options.audioPath Path to TTS MP3 speech file
 * @param {string} options.assSubtitlePath Path to generated .ass subtitle file
 * @param {string} options.outputVideoPath Path to save final rendered MP4
 * @returns {Promise<string>} Output video path
 */
export async function renderFinalVideo({
  videoClips = [],
  audioPath,
  assSubtitlePath,
  outputVideoPath
}) {
  const dir = path.dirname(outputVideoPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    let command = ffmpeg();

    // If no video clips available, create a solid dark aesthetic animated background canvas
    if (!videoClips || videoClips.length === 0) {
      command.input('color=c=0x0f0f1a:s=1080x1920:r=30')
        .inputOptions(['-f lavfi']);
    } else {
      // Input background videos
      videoClips.forEach(clip => {
        if (fs.existsSync(clip)) {
          command.input(clip);
        }
      });
    }

    // Input TTS Audio
    command.input(audioPath);

    // Escape ASS path for FFmpeg filter graph (Windows path escaping)
    const escapedAssPath = assSubtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');

    // Build complex filtergraph for 1080x1920 formatting & subtitles overlay
    const filterGraph = [
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
      'setsar=1',
      `ass='${escapedAssPath}'`
    ].join(',');

    command
      .videoFilters(filterGraph)
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 22',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-shortest'
      ])
      .output(outputVideoPath)
      .on('start', (commandLine) => {
        console.log('[RenderEngine] FFmpeg process started with command:', commandLine);
      })
      .on('end', () => {
        console.log('[RenderEngine] Video rendering completed successfully:', outputVideoPath);
        resolve(outputVideoPath);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[RenderEngine] FFmpeg Render Error:', err.message);
        console.error('[RenderEngine] FFmpeg Stderr:', stderr);
        reject(new Error(`FFmpeg Render Error: ${err.message}`));
      });

    command.run();
  });
}
