import fs from 'fs-extra';
import path from 'path';

/**
 * Formats seconds into ASS timestamp format: H:MM:SS.cs (e.g., 0:00:01.50)
 */
function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);

  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  const csStr = String(cs).padStart(2, '0');

  return `${h}:${mStr}:${sStr}.${csStr}`;
}

/**
 * Generates an ASS subtitle file with animated active word highlights.
 * @param {Object} options
 * @param {Array<{text: string, durationEstSeconds: number}>} options.sections Script sections
 * @param {string} options.outputAssPath Output file path for .ass file
 * @param {Object} options.style Subtitle styling preferences
 */
export async function generateAssSubtitles({ sections, outputAssPath, style = {} }) {
  const dir = path.dirname(outputAssPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fontName = style.fontName || 'Arial';
  const fontSize = style.fontSize || 22;
  const primaryColor = style.primaryColor || '&H00FFFFFF'; // White
  const highlightColor = style.highlightColor || '&H0000FFFF'; // Yellow
  const outlineColor = style.outlineColor || '&H00000000'; // Black outline

  let assContent = `[Script Info]
Title: Hermes Dynamic Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${highlightColor},${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,280,1
Style: ActiveWord,${fontName},${fontSize},${highlightColor},${primaryColor},${outlineColor},&H80000000,-1,0,0,0,110,110,0,0,1,5,3,2,40,40,280,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let currentTime = 0.5; // Start offset

  for (const section of sections) {
    const text = section.text.trim();
    const words = text.split(/\s+/);
    const duration = section.durationEstSeconds || Math.max(2, words.length * 0.4);
    const timePerWord = duration / words.length;

    // Split words into small display chunks (3-5 words per screen for short-form retention)
    const chunkSize = 4;
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunkWords = words.slice(i, i + chunkSize);
      const chunkStartTime = currentTime + i * timePerWord;
      const chunkEndTime = chunkStartTime + chunkWords.length * timePerWord;

      // Render line with active highlight
      for (let j = 0; j < chunkWords.length; j++) {
        const wordStart = chunkStartTime + j * timePerWord;
        const wordEnd = wordStart + timePerWord;

        // Build string where active word has highlight styling
        const formattedLine = chunkWords.map((w, idx) => {
          if (idx === j) {
            return `{\\c${highlightColor}\\fscx115\\fscy115}${w.toUpperCase()}{\\r}`;
          }
          return `{\\c${primaryColor}}${w.toUpperCase()}`;
        }).join(' ');

        assContent += `Dialogue: 0,${formatAssTime(wordStart)},${formatAssTime(wordEnd)},Default,,0,0,0,,${formattedLine}\n`;
      }
    }

    currentTime += duration;
  }

  await fs.writeFile(outputAssPath, assContent, 'utf8');
  return outputAssPath;
}
