import { describe, expect, it } from 'vitest';
import { buildWaveformCache, buildWaveformCacheFromPeaks, computePeaks, downsamplePeaks, parseWaveformCache } from '../core/waveform.js';

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

describe('waveform cache', () => {
  it('builds a versioned normalized cache', () => {
    const cache = buildWaveformCache(new Int16Array([0, 32767, 0, -32768]), 0.5, 8, 2);
    expect(cache.version).toBe(1);
    expect(cache.peaksPerSecond).toBe(2);
    expect(cache.peaks).toHaveLength(1);
    expect(parseWaveformCache(cache)).toEqual(cache);
  });

  it('rejects malformed cache values', () => {
    expect(() => parseWaveformCache({ version: 1, durationSec: 1, peaksPerSecond: 50, peaks: [1.2] })).toThrow('invalid waveform cache');
  });

  it('builds a cache from streamed RMS peaks', () => {
    expect(buildWaveformCacheFromPeaks([0, 0.5, 1], 0.04, 50)).toMatchObject({ version: 1, peaks: [0, 0.75] });
  });
});
