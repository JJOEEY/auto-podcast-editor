import type { CutProposal, Settings, Word } from './types.js';

const FILLER_LEXICON = new Set(['ừm', 'ừ', 'à', 'ờ', 'ơ', 'nhỉ', 'ừm...', 'à...']);

export function proposeCuts(words: Word[], _peaks: number[], settings: Settings): CutProposal[] {
  const out: CutProposal[] = [];
  for (const w of words) {
    const text = w.text.trim().toLowerCase();
    if (FILLER_LEXICON.has(text) && w.end - w.start <= settings.fillerMaxSec) {
      out.push({
        id: `filler-${w.start.toFixed(2)}`,
        start: w.start,
        end: w.end,
        kind: 'filler',
        reason: `filler word "${w.text}"`,
        confidence: 0.85,
      });
    }
  }
  for (let i = 0; i + 1 < words.length; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    if (gapEnd - gapStart >= settings.silenceSec) {
      out.push({
        id: `silence-${gapStart.toFixed(2)}`,
        start: gapStart,
        end: gapEnd,
        kind: 'silence',
        reason: `silence ${(gapEnd - gapStart).toFixed(2)}s`,
        confidence: gapEnd - gapStart >= 2 * settings.silenceSec ? 0.95 : 0.75,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
