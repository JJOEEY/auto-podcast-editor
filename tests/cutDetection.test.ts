import { describe, expect, it } from 'vitest';
import { dedupeIds, normalizeFiller, proposeCuts } from '../core/cutDetection.js';
import type { Settings } from '../core/types.js';

const settings: Settings = { silenceSec: 0.6, fillerMaxSec: 1.0, lowAudioDb: -40, topicPauseSec: 2.0, model: 'base' };

describe('proposeCuts', () => {
  it('flags silence gaps between words longer than threshold', () => {
    const words = [
      { text: 'xin', start: 0.0, end: 0.3 },
      { text: 'chào', start: 1.5, end: 1.8 },
    ];
    const out = proposeCuts(words, [], settings);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('silence');
    expect(out[0].start).toBeCloseTo(0.3);
    expect(out[0].end).toBeCloseTo(1.5);
  });

  it('flags filler words shorter than fillerMaxSec', () => {
    const words = [
      { text: 'hôm', start: 0.0, end: 0.3 },
      { text: 'ừm', start: 0.4, end: 0.8 },
      { text: 'nay', start: 0.9, end: 1.2 },
    ];
    const out = proposeCuts(words, [], settings);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('filler');
  });

  it('ignores gaps shorter than threshold', () => {
    const words = [
      { text: 'a', start: 0.0, end: 0.3 },
      { text: 'b', start: 0.6, end: 0.9 },
    ];
    expect(proposeCuts(words, [], settings)).toHaveLength(0);
  });
});

describe('normalizeFiller', () => {
  it('strips punctuation and case', () => {
    expect(normalizeFiller('ừm,')).toBe('ừm');
    expect(normalizeFiller('À.')).toBe('à');
    expect(normalizeFiller('...')).toBe('');
  });
});

describe('hardened proposals', () => {
  it('keeps distinct ids for two close filler runs', () => {
    const words = [
      { text: 'ừm', start: 10.001, end: 10.05 },
      { text: 'ừm', start: 10.6, end: 10.65 },
      { text: 'rồi', start: 12.0, end: 12.3 },
    ];
    const fillers = proposeCuts(words, [], settings).filter((p) => p.kind === 'filler');
    expect(fillers).toHaveLength(2);
    expect(fillers[0].id).not.toBe(fillers[1].id);
  });

  it('merges a repeated filler run into one proposal', () => {
    const words = [
      { text: 'ừm,', start: 1.0, end: 1.3 },
      { text: 'ừm', start: 1.4, end: 1.7 },
      { text: 'vâng', start: 3.0, end: 3.3 },
    ];
    const fillers = proposeCuts(words, [], settings).filter((p) => p.kind === 'filler');
    expect(fillers).toHaveLength(1);
    expect(fillers[0].start).toBeCloseTo(1.0);
    expect(fillers[0].end).toBeCloseTo(1.7);
  });

  it('matches expanded lexicon', () => {
    const words = [
      { text: 'uh', start: 0.0, end: 0.3 },
      { text: 'xong', start: 1.5, end: 1.8 },
    ];
    expect(proposeCuts(words, [], settings).some((p) => p.kind === 'filler')).toBe(true);
  });
});

describe('filler run boundary', () => {
  const mk = (gap: number) => ([
    { text: 'ừm', start: 1.0, end: 2.0 },
    { text: 'ừm', start: 2.0 + gap, end: 2.2 + gap },
    { text: 'xong', start: 5.0, end: 5.3 },
  ]);

  it('splits runs at exactly 0.5s gap', () => {
    expect(proposeCuts(mk(0.5), [], settings).filter((p) => p.kind === 'filler')).toHaveLength(2);
  });

  it('merges runs below 0.5s gap', () => {
    expect(proposeCuts(mk(0.49), [], settings).filter((p) => p.kind === 'filler')).toHaveLength(1);
  });
});

describe('normalizeFiller unicode', () => {
  it('handles NFD input', () => {
    expect(normalizeFiller('ừm'.normalize('NFD'))).toBe('ừm');
  });
});

describe('dedupeIds', () => {
  it('suffixes collisions deterministically', () => {
    expect(dedupeIds(['a', 'a', 'b', 'a'])).toEqual(['a', 'a-2', 'b', 'a-3']);
  });
});
