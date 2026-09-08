import type { CaptionLine } from './types.js';

function stamp(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) throw new RangeError('invalid timestamp');
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  const r = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${r}`;
}

export function buildSrt(lines: CaptionLine[]): string {
  if (lines.length === 0) return '';
  return (
    lines
      .map((l, i) => {
        if (!(l.start <= l.end)) throw new RangeError('cue start after end');
        return `${i + 1}\n${stamp(l.start)} --> ${stamp(l.end)}\n${l.text}\n`;
      })
      .join('\n') + '\n'
  );
}

export function buildCaptionTxt(title: string, hashtags: string[]): string {
  if (hashtags.length !== 4) throw new Error('caption requires exactly 4 hashtags');
  for (const h of hashtags) if (!/^#[^\s#]+$/.test(h)) throw new Error('malformed hashtag');
  return `${title}\n\n${hashtags.join(' ')}`;
}
