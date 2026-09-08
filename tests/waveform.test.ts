import { describe, expect, it } from 'vitest';
import { computePeaks, downsamplePeaks } from '../core/waveform.js';

describe('computePeaks', () => {
  it('returns one RMS value per window', () => {
    const samples = new Int16Array([0, 32767, 0, -32768, 0, 0, 0, 0]);
    const peaks = computePeaks(samples, 8, 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeGreaterThan(peaks[1]);
    expect(peaks[1]).toBe(0);
  });
});

describe('downsamplePeaks', () => {
  it('averages buckets to target length', () => {
    expect(downsamplePeaks([0.2, 0.4, 0.6, 0.8], 2)).toEqual([0.3, 0.7]);
  });
});
