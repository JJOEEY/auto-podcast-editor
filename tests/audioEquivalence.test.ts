import { describe, expect, it } from 'vitest';
import { comparePcm16 } from '../core/audioEquivalence.js';

function pcm16(values: number[]): Uint8Array {
  const buffer = new ArrayBuffer(values.length * 2);
  const view = new DataView(buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return new Uint8Array(buffer);
}

describe('PCM equivalence', () => {
  it('passes identical PCM with infinite SNR', () => {
    const result = comparePcm16(pcm16([0, 1000, -1000]), pcm16([0, 1000, -1000]));
    expect(result.passed).toBe(true);
    expect(result.snrDb).toBe(Infinity);
  });

  it('uses absolute error for near silence instead of an unstable SNR ratio', () => {
    const result = comparePcm16(pcm16([0, 0, 1]), pcm16([0, 0, 2]));
    expect(result.passed).toBe(true);
  });

  it('fails a materially different non-silent signal', () => {
    const result = comparePcm16(pcm16([12000, -12000, 12000]), pcm16([-12000, 12000, -12000]));
    expect(result.passed).toBe(false);
  });
});
