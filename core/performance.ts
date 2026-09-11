export interface PerformanceSample {
  fixtureId: string;
  whisper60MinSec: number;
  previewFps: number;
  export4k10MinSec: number;
  timelineP95Ms: number;
  stabilityHours: number;
}

export interface PerformanceThresholds {
  whisper60MinMaxSec: number;
  previewMinFps: number;
  export4k10MinMaxSec: number;
  timelineP95MaxMs: number;
  stabilityMinHours: number;
}

export const DEFAULT_PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  whisper60MinMaxSec: 120 * 60,
  previewMinFps: 24,
  export4k10MinMaxSec: 30 * 60,
  timelineP95MaxMs: 100,
  stabilityMinHours: 2,
};

export interface PerformanceGateResult {
  passed: boolean;
  fixtureResults: Array<{ fixtureId: string; passed: boolean; failures: string[] }>;
  worstFixtureId: string | null;
}

function isValidSample(sample: PerformanceSample): boolean {
  return Boolean(sample.fixtureId.trim())
    && Number.isFinite(sample.whisper60MinSec)
    && Number.isFinite(sample.previewFps)
    && Number.isFinite(sample.export4k10MinSec)
    && Number.isFinite(sample.timelineP95Ms)
    && Number.isFinite(sample.stabilityHours);
}

export function evaluatePerformanceGate(samples: PerformanceSample[], thresholds = DEFAULT_PERFORMANCE_THRESHOLDS): PerformanceGateResult {
  const fixtureResults = samples.map((sample) => {
    const failures: string[] = [];
    if (!isValidSample(sample)) failures.push('missing-or-invalid-metric');
    if (sample.whisper60MinSec > thresholds.whisper60MinMaxSec) failures.push('whisper');
    if (sample.previewFps < thresholds.previewMinFps) failures.push('preview-fps');
    if (sample.export4k10MinSec > thresholds.export4k10MinMaxSec) failures.push('export-4k');
    if (sample.timelineP95Ms >= thresholds.timelineP95MaxMs) failures.push('timeline-p95');
    if (sample.stabilityHours < thresholds.stabilityMinHours) failures.push('stability');
    return { fixtureId: sample.fixtureId, passed: failures.length === 0, failures };
  });
  const worst = samples
    .map((sample, index) => ({ sample, result: fixtureResults[index] }))
    .sort((a, b) => Number(a.result.passed) - Number(b.result.passed) || b.sample.timelineP95Ms - a.sample.timelineP95Ms)[0];
  return { passed: samples.length > 0 && fixtureResults.every((result) => result.passed), fixtureResults, worstFixtureId: worst?.sample.fixtureId ?? null };
}
