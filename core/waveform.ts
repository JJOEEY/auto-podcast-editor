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
