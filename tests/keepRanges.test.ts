import { describe, expect, it } from 'vitest';
import { buildKeepClips, complementRanges, filterCaptionsToKeeps } from '../core/keepRanges.js';
import { proposeCuts } from '../core/cutDetection.js';
import { DEFAULT_SETTINGS } from '../core/defaults.js';

const cut = (start: number, end: number) => ({
  id: `c-${start}`, start, end, kind: 'silence' as const, reason: 't', confidence: 1,
});

describe('complementRanges', () => {
  it('complements the pipeline fixture cuts', () => {
    const words = [
      { text: 'xin', start: 0.0, end: 0.3 },
      { text: 'chào', start: 0.4, end: 0.7 },
      { text: 'ừm', start: 0.8, end: 1.1 },
      { text: 'các', start: 2.5, end: 2.7 },
      { text: 'bạn', start: 2.8, end: 3.0 },
    ];
    const proposals = proposeCuts(words, [], DEFAULT_SETTINGS);
    expect(complementRanges(proposals, 4)).toEqual([
      { start: 0, end: 0.8 },
      { start: 2.5, end: 4 },
    ]);
  });

  it('merges overlaps and clamps to duration', () => {
    expect(complementRanges([cut(-5, 3), cut(2, 6), cut(8, 99)], 10)).toEqual([
      { start: 6, end: 8 },
    ]);
  });

  it('returns one full keep when nothing is cut', () => {
    expect(buildKeepClips([], 10)).toEqual([
      { id: 'keep-1', track: 'V1', start: 0, end: 10, label: 'keep 1' },
    ]);
  });
});

describe('filterCaptionsToKeeps', () => {
  it('drops captions fully inside removed regions', () => {
    const caps = [
      { id: 'a', start: 0, end: 1, text: 'keep me' },
      { id: 'b', start: 5, end: 6, text: 'drop me' },
    ];
    expect(filterCaptionsToKeeps(caps, [{ start: 0, end: 2 }]).map((c) => c.id)).toEqual(['a']);
  });
});
