import { describe, expect, it } from 'vitest';
import { evaluatePerformanceGate } from '../core/performance.js';

describe('performance gate', () => {
  it('requires every fixture to pass all thresholds', () => {
    const result = evaluatePerformanceGate([
      { fixtureId: 'good', whisper60MinSec: 3000, previewFps: 30, export4k10MinSec: 1200, timelineP95Ms: 50, stabilityHours: 2 },
      { fixtureId: 'slow', whisper60MinSec: 9000, previewFps: 20, export4k10MinSec: 1200, timelineP95Ms: 150, stabilityHours: 1 },
    ]);
    expect(result.passed).toBe(false);
    expect(result.fixtureResults[1].failures).toEqual(['whisper', 'preview-fps', 'timeline-p95', 'stability']);
    expect(result.worstFixtureId).toBe('slow');
  });

  it('does not pass with no measurements', () => {
    expect(evaluatePerformanceGate([]).passed).toBe(false);
  });

  it('fails closed when a required measurement is missing or invalid', () => {
    const result = evaluatePerformanceGate([{
      fixtureId: 'incomplete',
      whisper60MinSec: 300,
      previewFps: Number.NaN,
      export4k10MinSec: 1200,
      timelineP95Ms: 50,
      stabilityHours: 2,
    }]);
    expect(result.passed).toBe(false);
    expect(result.fixtureResults[0].failures).toContain('missing-or-invalid-metric');
  });
});
