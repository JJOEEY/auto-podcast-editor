import type { CaptionLine } from './types.js';

function stamp(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  const r = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${r}`;
}

export function buildSrt(lines: CaptionLine[]): string {
  return lines.map((l, i) => `${i + 1}\n${stamp(l.start)} --> ${stamp(l.end)}\n${l.text}\n`).join('\n');
}

export function buildCaptionTxt(title: string, hashtags: string[]): string {
  if (hashtags.length !== 4) throw new Error('caption requires exactly 4 hashtags');
  return `${title}\n\n${hashtags.join(' ')}`;
}
