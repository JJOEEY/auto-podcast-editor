export interface VideoGoldenMetrics {
  meanY: number;
  meanU: number;
  meanV: number;
  meanAll: number;
  minAll?: number;
  framesCompared?: number;
}

export interface VideoGoldenGate {
  minSsim: number;
  expectedFrames?: number;
  actualFrames?: number;
  maxFrameDelta?: number;
}

export function parseFfmpegSsimOutput(output: string): VideoGoldenMetrics {
  const matches = [...output.matchAll(/All:([0-9.]+)\s*\([^)]*\)/g)];
  if (matches.length === 0) throw new Error('FFmpeg output did not contain an SSIM result');
  const last = matches[matches.length - 1]?.[1];
  const line = output.split(/\r?\n/).reverse().find((entry) => entry.includes('Y:') && entry.includes('U:') && entry.includes('V:')) ?? '';
  const y = line.match(/Y:([0-9.]+)/)?.[1];
  const u = line.match(/U:([0-9.]+)/)?.[1];
  const v = line.match(/V:([0-9.]+)/)?.[1];
  if (!last || !y || !u || !v) throw new Error('FFmpeg SSIM result is incomplete');
  return { meanY: Number(y), meanU: Number(u), meanV: Number(v), meanAll: Number(last), framesCompared: matches.length };
}

export function assertVideoGoldenGate(metrics: VideoGoldenMetrics, gate: VideoGoldenGate): void {
  if (!Number.isFinite(metrics.meanAll) || metrics.meanAll < gate.minSsim) {
    throw new Error(`SSIM gate failed: ${metrics.meanAll.toFixed(6)} < ${gate.minSsim.toFixed(6)}`);
  }
  if (gate.expectedFrames !== undefined && gate.actualFrames !== undefined) {
    const maxDelta = gate.maxFrameDelta ?? 0;
    if (Math.abs(gate.expectedFrames - gate.actualFrames) > maxDelta) {
      throw new Error(`frame-count gate failed: expected ${gate.expectedFrames}, actual ${gate.actualFrames}`);
    }
  }
}
