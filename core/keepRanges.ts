import type { CaptionLine, Clip, CutProposal } from './types.js';

export interface KeepRange {
  start: number;
  end: number;
}

function mergeRanges(ranges: KeepRange[]): KeepRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: KeepRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      out.push({ start: r.start, end: r.end });
    }
  }
  return out;
}

/** Complement of cut proposals inside [0, durationSec]: the ranges to KEEP. */
export function complementRanges(cuts: CutProposal[], durationSec: number): KeepRange[] {
  const clamped = cuts
    .map((c) => ({ start: Math.max(0, c.start), end: Math.min(durationSec, c.end) }))
    .filter((c) => c.end - c.start > 0);
  const merged = mergeRanges(clamped);
  const keeps: KeepRange[] = [];
  let cursor = 0;
  for (const cut of merged) {
    if (cut.start > cursor) keeps.push({ start: cursor, end: cut.start });
    cursor = Math.max(cursor, cut.end);
  }
  if (cursor < durationSec) keeps.push({ start: cursor, end: durationSec });
  return keeps;
}

/** Build V1 keep clips from selected cut proposals. Empty selection = one full keep. */
export function buildKeepClips(cuts: CutProposal[], durationSec: number): Clip[] {
  const keeps = complementRanges(cuts, durationSec);
  if (keeps.length === 0) return [];
  return keeps.map((k, i) => ({
    id: `keep-${i + 1}`,
    track: 'V1' as const,
    start: k.start,
    end: k.end,
    label: `keep ${i + 1}`,
  }));
}

/** Drop captions that don't intersect any keep clip (MVP: keep whole, don't clip). */
export function filterCaptionsToKeeps(captions: CaptionLine[], keeps: KeepRange[]): CaptionLine[] {
  return captions.filter((c) => keeps.some((k) => c.start < k.end && c.end > k.start));
}
