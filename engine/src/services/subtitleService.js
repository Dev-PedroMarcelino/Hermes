import fs from 'fs-extra';
import path from 'path';

/** Formats seconds as an ASS timestamp: H:MM:SS.cs */
function formatAssTime(seconds) {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.round((safe % 1) * 100);

  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(Math.min(cs, 99)).padStart(2, '0')}`;
}

/** ASS uses `{` and `}` for override blocks, so literal braces must go. */
function sanitize(text) {
  return String(text).replace(/[{}]/g, '').replace(/\\/g, '/').trim();
}

/**
 * Builds word timings. Prefers the real cues emitted by Edge TTS; falls back to
 * distributing the measured narration length across words by count.
 */
function buildWordTimings({ cues, sections, totalDurationSeconds }) {
  if (Array.isArray(cues) && cues.length > 0) {
    return cues
      .map(cue => ({
        word: sanitize(cue.part),
        start: cue.start / 1000,
        end: cue.end / 1000
      }))
      .filter(w => w.word.length > 0);
  }

  const words = sections
    .flatMap(section => sanitize(section.text || '').split(/\s+/))
    .filter(Boolean);

  if (words.length === 0) return [];

  const total = totalDurationSeconds || words.length * 0.4;
  const perWord = total / words.length;

  return words.map((word, index) => ({
    word,
    start: index * perWord,
    end: (index + 1) * perWord
  }));
}

/**
 * Generates an .ass subtitle file with karaoke-style word highlighting, sized
 * for a 1080x1920 vertical short.
 */
export async function generateAssSubtitles({
  sections = [],
  cues = [],
  outputAssPath,
  totalDurationSeconds = null,
  style = {}
}) {
  await fs.ensureDir(path.dirname(outputAssPath));

  const fontName = style.fontName || 'Arial';
  // Font size is in PlayRes units (1080x1920), so ~96 is a readable phone caption
  const fontSize = style.fontSize || 96;
  const primaryColor = style.primaryColor || '&H00FFFFFF'; // white
  const highlightColor = style.highlightColor || '&H0000FFFF'; // yellow
  const outlineColor = style.outlineColor || '&H00000000'; // black
  const marginV = style.marginV || 420;
  const wordsPerScreen = style.wordsPerScreen || 3;

  let assContent = `[Script Info]
Title: Hermes Dynamic Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${highlightColor},${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,6,3,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const timings = buildWordTimings({ cues, sections, totalDurationSeconds });

  // Group words into small screens, then emit one line per word so the active
  // word can be highlighted while its neighbours stay visible for context.
  for (let i = 0; i < timings.length; i += wordsPerScreen) {
    const group = timings.slice(i, i + wordsPerScreen);

    group.forEach((active, indexInGroup) => {
      const line = group
        .map((entry, idx) =>
          idx === indexInGroup
            ? `{\\c${highlightColor}\\fscx112\\fscy112}${entry.word.toUpperCase()}{\\r}`
            : entry.word.toUpperCase()
        )
        .join(' ');

      // Bridge the silence between words so captions never flicker off mid-phrase
      const nextStart = group[indexInGroup + 1]?.start ?? active.end;
      const end = Math.max(active.end, nextStart);

      assContent += `Dialogue: 0,${formatAssTime(active.start)},${formatAssTime(end)},Default,,0,0,0,,${line}\n`;
    });
  }

  // An [Events] block with no dialogue makes the ass filter fail
  if (!assContent.includes('Dialogue:')) {
    assContent += 'Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,\n';
  }

  await fs.writeFile(outputAssPath, assContent, 'utf8');
  return outputAssPath;
}
