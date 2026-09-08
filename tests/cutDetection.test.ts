import { describe, expect, it } from 'vitest';
import { normalizeFiller, proposeCuts } from '../core/cutDetection.js';
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
  it('gives distinct ids to close starts (ms precision + end)', () => {
    const words = [
      { text: 'ừm', start: 10.001, end: 10.05 },
      { text: 'ừm', start: 10.06, end: 10.1 },
      { text: 'rồi', start: 12.0, end: 12.3 },
    ];
    const out = proposeCuts(words, [], settings);
    const ids = out.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
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
