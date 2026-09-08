import type { CutProposal, Settings, Word } from './types.js';

const FILLER_LEXICON = new Set(['ừm', 'ừ', 'à', 'ờ', 'ơ', 'nhỉ', 'um', 'uh', 'ờm']);

const FILLER_MERGE_GAP_SEC = 0.5;

export function normalizeFiller(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}]/gu, '');
}

function proposalId(kind: string, start: number, end: number): string {
  return `${kind}-${Math.round(start * 1000)}-${Math.round(end * 1000)}`;
}

export function proposeCuts(words: Word[], _peaks: number[], settings: Settings): CutProposal[] {
  // _peaks reserved for low-audio detection (ProposalKind 'low-audio') — do not remove.
  const out: CutProposal[] = [];
  let run: Word[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    const start = run[0].start;
    const end = run[run.length - 1].end;
    out.push({
      id: proposalId('filler', start, end),
      start,
      end,
      kind: 'filler',
      reason: run.length === 1 ? `filler word "${run[0].text}"` : `filler run x${run.length}`,
      confidence: 0.85,
    });
    run = [];
  };
  for (const w of words) {
    const isFiller = FILLER_LEXICON.has(normalizeFiller(w.text)) && w.end - w.start <= settings.fillerMaxSec;
    if (!isFiller) {
      flushRun();
      continue;
    }
    if (run.length > 0 && w.start - run[run.length - 1].end >= FILLER_MERGE_GAP_SEC) flushRun();
    run.push(w);
  }
  flushRun();
  for (let i = 0; i + 1 < words.length; i++) {
    const gapStart = words[i].end;
    const gapEnd = words[i + 1].start;
    if (gapEnd - gapStart >= settings.silenceSec) {
      out.push({
        id: proposalId('silence', gapStart, gapEnd),
        start: gapStart,
        end: gapEnd,
        kind: 'silence',
        reason: `silence ${(gapEnd - gapStart).toFixed(2)}s`,
        confidence: gapEnd - gapStart >= 2 * settings.silenceSec ? 0.95 : 0.75,
      });
    }
  }
  // NOTE: a filler flanked by pauses yields touching proposals (silence+filler+silence);
  // downstream treats them as one cut range (merge at apply time, P1).
  return out.sort((a, b) => a.start - b.start);
}
