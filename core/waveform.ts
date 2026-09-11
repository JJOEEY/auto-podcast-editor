export function computePeaks(samples: Int16Array, sampleRate: number, peaksPerSecond: number): number[] {
  const windowSize = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
  const peaks: number[] = [];
  for (let i = 0; i < samples.length; i += windowSize) {
    let sum = 0;
    const end = Math.min(i + windowSize, samples.length);
    for (let j = i; j < end; j++) {
      const v = samples[j] / 32768;
      sum += v * v;
    }
    peaks.push(Number(Math.sqrt(sum / (end - i)).toFixed(4)));
  }
  return peaks;
}

export function downsamplePeaks(peaks: number[], targetLength: number): number[] {
  if (targetLength <= 0) throw new Error('targetLength must be positive');
  if (peaks.length <= targetLength) return [...peaks];
  const out: number[] = [];
  const bucket = peaks.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.floor((i + 1) * bucket);
    const slice = peaks.slice(start, Math.max(end, start + 1));
    out.push(Number((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(4)));
  }
  return out;
}

export interface WaveformCache {
  version: 1;
  durationSec: number;
  peaksPerSecond: number;
  peaks: number[];
}

export function buildWaveformCacheFromPeaks(rawPeaks: number[], durationSec: number, peaksPerSecond = 50): WaveformCache {
  if (!Number.isFinite(durationSec) || durationSec < 0) throw new RangeError('durationSec must be non-negative');
  if (!Number.isFinite(peaksPerSecond) || peaksPerSecond <= 0) throw new RangeError('peaksPerSecond must be positive');
  const targetLength = Math.max(1, Math.ceil(durationSec * peaksPerSecond));
  const peaks = rawPeaks.length > 0 ? downsamplePeaks(rawPeaks, targetLength) : [0];
  return { version: 1, durationSec, peaksPerSecond, peaks };
}

export function buildWaveformCache(samples: Int16Array, durationSec: number, sampleRate = 8000, peaksPerSecond = 50): WaveformCache {
  const raw = computePeaks(samples, sampleRate, peaksPerSecond);
  return buildWaveformCacheFromPeaks(raw, durationSec, peaksPerSecond);
}

export function parseWaveformCache(input: unknown): WaveformCache {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('invalid waveform cache');
  const value = input as Partial<WaveformCache>;
  if (value.version !== 1 || typeof value.durationSec !== 'number' || !Number.isFinite(value.durationSec) || value.durationSec < 0 || typeof value.peaksPerSecond !== 'number' || value.peaksPerSecond <= 0 || !Array.isArray(value.peaks) || value.peaks.some((peak) => typeof peak !== 'number' || !Number.isFinite(peak) || peak < 0 || peak > 1)) {
    throw new Error('invalid waveform cache');
  }
  return { version: 1, durationSec: value.durationSec, peaksPerSecond: value.peaksPerSecond, peaks: [...value.peaks] };
}
