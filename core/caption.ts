import { dedupeIds } from './cutDetection.js';
import type { CaptionLine, Word } from './types.js';

const MAX_WORDS = 7;
const MIN_WORDS = 5;

export function chunkCaption(words: Word[]): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      id: `cc-${Math.round(current[0].start * 1000)}`,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(' '),
    });
    current = [];
  };
  for (const w of words) {
    current.push(w);
    const endsSentence = /[.!?…:]["'”’)\]}]*$/.test(w.text);
    if (current.length >= MAX_WORDS || (endsSentence && current.length >= MIN_WORDS)) flush();
  }
  flush();
  const ids = dedupeIds(lines.map((l) => l.id));
  return lines.map((l, i) => ({ ...l, id: ids[i] }));
}
