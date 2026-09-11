import type { Word } from './types.js';

export interface BoundaryPair {
  referenceStartSec: number;
  referenceEndSec: number;
  actualStartSec: number;
  actualEndSec: number;
}

export interface FillerDecision {
  expected: boolean;
  actual: boolean;
  confidence?: number;
}

export interface FillerEvent {
  startSec: number;
  endSec: number;
  text?: string;
}

export interface BenchmarkWord extends Word {}

export interface WhisperBenchmarkResult {
  medianBoundaryDeviationMs: number;
  p95BoundaryDeviationMs: number;
  fillerPrecision: number;
  fillerRecall: number;
  confidenceCalibrationError: number | null;
  passesReviewFirstGate: boolean;
  wordErrorRate?: number;
  alignedWordCount?: number;
  referenceWordCount?: number;
  actualWordCount?: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function benchmarkWhisperFixture(boundaries: BoundaryPair[], fillers: FillerDecision[]): WhisperBenchmarkResult {
  const deviations = boundaries.flatMap((pair) => [
    Math.abs(pair.actualStartSec - pair.referenceStartSec) * 1000,
    Math.abs(pair.actualEndSec - pair.referenceEndSec) * 1000,
  ]);
  const truePositive = fillers.filter((item) => item.expected && item.actual).length;
  const predictedPositive = fillers.filter((item) => item.actual).length;
  const expectedPositive = fillers.filter((item) => item.expected).length;
  const precision = predictedPositive === 0 ? 1 : truePositive / predictedPositive;
  const recall = expectedPositive === 0 ? 1 : truePositive / expectedPositive;
  const calibrated = fillers.filter((item) => item.confidence !== undefined).map((item) => Math.abs((item.confidence ?? 0) - (item.actual === item.expected ? 1 : 0)));
  const confidenceCalibrationError = calibrated.length === 0 ? null : calibrated.reduce((sum, value) => sum + value, 0) / calibrated.length;
  const medianBoundaryDeviationMs = percentile(deviations, 50);
  const p95BoundaryDeviationMs = percentile(deviations, 95);
  return {
    medianBoundaryDeviationMs,
    p95BoundaryDeviationMs,
    fillerPrecision: precision,
    fillerRecall: recall,
    confidenceCalibrationError,
    passesReviewFirstGate: medianBoundaryDeviationMs <= 80 && p95BoundaryDeviationMs <= 200 && precision >= 0.9,
  };
}

function normalizeWord(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

export function alignWhisperWords(reference: BenchmarkWord[], actual: BenchmarkWord[], lookahead = 12): BoundaryPair[] {
  const pairs: BoundaryPair[] = [];
  let cursor = 0;
  for (const expected of reference) {
    const normalized = normalizeWord(expected.text);
    if (!normalized) continue;
    let matched = -1;
    for (let index = cursor; index < Math.min(actual.length, cursor + lookahead); index += 1) {
      if (normalizeWord(actual[index].text) === normalized) {
        matched = index;
        break;
      }
    }
    if (matched < 0) continue;
    const word = actual[matched];
    pairs.push({ referenceStartSec: expected.start, referenceEndSec: expected.end, actualStartSec: word.start, actualEndSec: word.end });
    cursor = matched + 1;
  }
  return pairs;
}

export function wordErrorRate(reference: BenchmarkWord[], actual: BenchmarkWord[]): number {
  const expected = reference.map((word) => normalizeWord(word.text)).filter(Boolean);
  const observed = actual.map((word) => normalizeWord(word.text)).filter(Boolean);
  const row = Array.from({ length: observed.length + 1 }, (_, index) => index);
  for (let i = 1; i <= expected.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= observed.length; j += 1) {
      const previous = row[j];
      const substitution = diagonal + (expected[i - 1] === observed[j - 1] ? 0 : 1);
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, substitution);
      diagonal = previous;
    }
  }
  return expected.length === 0 ? 0 : row[observed.length] / expected.length;
}

function overlaps(left: FillerEvent, right: FillerEvent): boolean {
  const intersection = Math.max(0, Math.min(left.endSec, right.endSec) - Math.max(left.startSec, right.startSec));
  const shortest = Math.min(left.endSec - left.startSec, right.endSec - right.startSec);
  return shortest > 0 && intersection / shortest >= 0.25;
}

export function benchmarkWhisperWords(reference: BenchmarkWord[], actual: BenchmarkWord[], expectedFillers: FillerEvent[], actualFillers: Array<FillerEvent & { confidence?: number }>): WhisperBenchmarkResult {
  const boundaries = alignWhisperWords(reference, actual);
  const matchedActual = new Set<number>();
  const decisions: FillerDecision[] = expectedFillers.map((expected) => {
    const index = actualFillers.findIndex((candidate, candidateIndex) => !matchedActual.has(candidateIndex) && overlaps(expected, candidate));
    if (index >= 0) matchedActual.add(index);
    return { expected: true, actual: index >= 0, confidence: index >= 0 ? actualFillers[index].confidence : undefined };
  });
  actualFillers.forEach((candidate, index) => {
    if (!matchedActual.has(index)) decisions.push({ expected: false, actual: true, confidence: candidate.confidence });
  });
  return {
    ...benchmarkWhisperFixture(boundaries, decisions),
    wordErrorRate: wordErrorRate(reference, actual),
    alignedWordCount: boundaries.length,
    referenceWordCount: reference.length,
    actualWordCount: actual.length,
  };
}
