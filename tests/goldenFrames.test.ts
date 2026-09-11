import { describe, expect, it } from 'vitest';
import { compareGoldenFrames } from '../core/goldenFrames.js';

function frame(fill: number): Uint8Array {
  return Uint8Array.from([
    fill, fill, fill, 255, fill, fill, fill, 255,
    fill, fill, fill, 255, fill, fill, fill, 255,
  ]);
}

describe('golden frame equivalence', () => {
  it('passes an exact deterministic golden frame', () => {
    const result = compareGoldenFrames(frame(80), frame(80), { width: 2, height: 2, filterClass: 'deterministic' });
    expect(result).toMatchObject({ passed: true, exact: true, seedMatched: true, ssim: 1, meanAbsoluteError: 0, pixelsCompared: 4 });
  });

  it('fails a deterministic frame with a structural mismatch', () => {
    const expected = frame(20);
    const actual = frame(230);
    const result = compareGoldenFrames(expected, actual, { width: 2, height: 2, filterClass: 'deterministic' });
    expect(result.passed).toBe(false);
    expect(result.ssim).toBeLessThan(0.98);
  });

  it('requires the same seed for stochastic golden frames', () => {
    const result = compareGoldenFrames(frame(80), frame(80), { width: 2, height: 2, filterClass: 'stochastic', expectedSeed: 7, actualSeed: 8 });
    expect(result.ssim).toBe(1);
    expect(result.seedMatched).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('rejects invalid RGBA dimensions', () => {
    expect(() => compareGoldenFrames(new Uint8Array(3), new Uint8Array(3), { width: 1, height: 1, filterClass: 'deterministic' })).toThrow('exactly 4 RGBA bytes');
  });
});
