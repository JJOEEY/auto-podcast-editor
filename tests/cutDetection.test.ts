import { describe, expect, it } from 'vitest';
import { proposeCuts } from '../core/cutDetection.js';
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
