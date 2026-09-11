import { describe, expect, it } from 'vitest';
import { OFFICIAL_WORKLOAD, validateOfficialPerformanceEvidence, type OfficialPerformanceEvidence } from '../core/performanceReport.js';

const valid: OfficialPerformanceEvidence = {
  buildId: 'build-1', installed: true, fixtureId: 'slow', seekSamples: 100, timelineSamples: 1000, playerWindows: 12, frameSamples: 3600,
  previewFpsWindows: Array(12).fill(30), droppedFrameRates: Array(12).fill(0), seekP95Ms: 400, seekMaxMs: 800, timelineP95Ms: 20, timelineP99Ms: 30,
  export4k10MinSec: 1000, whisper60MinSec: 3000, stabilityHours: 2, memoryGrowthMiB: 100, memoryGrowthMiBPerHour: 50, peakTreeMemoryGiB: 4,
  workload: { ...OFFICIAL_WORKLOAD, trackIds: [...OFFICIAL_WORKLOAD.trackIds] },
};

describe('official performance evidence', () => {
  it('rejects missing samples, invalid numbers and non-installed runs', () => {
    const errors = validateOfficialPerformanceEvidence({ ...valid, installed: false, seekSamples: 1, seekP95Ms: Number.NaN }, 'build-1');
    expect(errors).toEqual(expect.arrayContaining(['performance must run from installed application', 'seek sample count must be 100', 'invalid numeric metric: seekP95Ms']));
  });
  it('accepts an exact official workload with valid measurements', () => {
    expect(validateOfficialPerformanceEvidence(valid, 'build-1')).toEqual([]);
  });
});
