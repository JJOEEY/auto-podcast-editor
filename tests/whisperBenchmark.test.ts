import { describe, expect, it } from 'vitest';
import { alignWhisperWords, benchmarkWhisperFixture, benchmarkWhisperWords, wordErrorRate } from '../core/whisperBenchmark.js';

describe('whisper benchmark', () => {
  it('computes boundary, filler and calibration metrics', () => {
    const result = benchmarkWhisperFixture([
      { referenceStartSec: 0, referenceEndSec: 1, actualStartSec: 0.02, actualEndSec: 1.03 },
      { referenceStartSec: 2, referenceEndSec: 3, actualStartSec: 2.01, actualEndSec: 3.02 },
    ], [
      { expected: true, actual: true, confidence: 0.9 },
      { expected: false, actual: false, confidence: 0.8 },
    ]);
    expect(result.medianBoundaryDeviationMs).toBe(20);
    expect(result.p95BoundaryDeviationMs).toBeCloseTo(30);
    expect(result.fillerPrecision).toBe(1);
    expect(result.fillerRecall).toBe(1);
    expect(result.confidenceCalibrationError).toBeCloseTo(0.15);
    expect(result.passesReviewFirstGate).toBe(true);
  });

  it('fails the review-first gate for inaccurate boundaries or filler precision', () => {
    const result = benchmarkWhisperFixture([
      { referenceStartSec: 0, referenceEndSec: 1, actualStartSec: 0.1, actualEndSec: 1.3 },
    ], [
      { expected: true, actual: false, confidence: 0.8 },
      { expected: false, actual: true, confidence: 0.8 },
    ]);
    expect(result.passesReviewFirstGate).toBe(false);
    expect(result.fillerPrecision).toBe(0);
  });

  it('aligns Vietnamese words and computes WER from reference/actual words', () => {
    const reference = [
      { text: 'Xin', start: 0, end: 0.2 },
      { text: 'chào', start: 0.2, end: 0.5 },
      { text: 'bạn', start: 0.6, end: 0.8 },
    ];
    const actual = [
      { text: 'xin', start: 0.02, end: 0.21 },
      { text: 'bạn', start: 0.62, end: 0.81 },
    ];
    expect(alignWhisperWords(reference, actual)).toHaveLength(2);
    expect(wordErrorRate(reference, actual)).toBeCloseTo(1 / 3);
  });

  it('matches filler events one-to-one and reports WER with the benchmark', () => {
    const result = benchmarkWhisperWords(
      [{ text: 'ừm', start: 1, end: 1.3 }, { text: 'xin', start: 2, end: 2.3 }],
      [{ text: 'ừm', start: 1.02, end: 1.29, confidence: 0.8 }, { text: 'xin', start: 2.02, end: 2.31 }],
      [{ startSec: 1, endSec: 1.3, text: 'ừm' }],
      [{ startSec: 1.02, endSec: 1.29, text: 'ừm', confidence: 0.85 }],
    );
    expect(result.wordErrorRate).toBe(0);
    expect(result.fillerPrecision).toBe(1);
    expect(result.fillerRecall).toBe(1);
  });
});
