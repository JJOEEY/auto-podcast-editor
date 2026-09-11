import { describe, expect, it } from 'vitest';
import { buildTransitionPlan } from '../core/transitionPlan.js';
import type { TimelineItem, Track } from '../core/types.js';

const tracks: Track[] = [{ id: 'V1', kind: 'video', name: 'Video 1', index: 0 }];
const item = (id: string, startFrame: number, transitionKind?: TimelineItem['transitionKind'], before = 30, after = 30): TimelineItem => ({
  id,
  trackId: 'V1',
  label: id,
  startFrame,
  durationFrames: 90,
  transitionKind,
  source: { sourceIn: startFrame / 30, sourceOut: (startFrame + 90) / 30, handleBeforeFrames: before, handleAfterFrames: after },
  effects: transitionKind ? [{ id: `effect-${id}`, type: transitionKind, enabled: true, params: { durationFrames: 30 } }] : [],
});

describe('transition plan', () => {
  it('overlaps source ranges when both sides have handles', () => {
    const plan = buildTransitionPlan([item('a', 0, 'fade'), item('b', 90)], tracks, { fpsNum: 30, fpsDen: 1 });
    expect(plan.warnings).toEqual([]);
    expect(plan.placements[0]).toMatchObject({ outputStartFrame: 0, outputDurationFrames: 105, sourceInFrame: 0, sourceOutFrame: 105 });
    expect(plan.placements[1]).toMatchObject({ outputStartFrame: 75, outputDurationFrames: 105, sourceInFrame: 75, sourceOutFrame: 180 });
    expect(plan.totalFrames).toBe(180);
  });

  it('falls back to a hard cut when handles are insufficient', () => {
    const plan = buildTransitionPlan([item('a', 0, 'fade', 0, 0), item('b', 90, undefined, 0, 0)], tracks, { fpsNum: 30, fpsDen: 1 });
    expect(plan.warnings[0]).toContain('insufficient handles');
    expect(plan.placements[0].outputDurationFrames).toBe(90);
    expect(plan.placements[1].outputStartFrame).toBe(90);
  });

  it('preserves an intentional gap instead of compacting the next clip', () => {
    const plan = buildTransitionPlan([item('a', 0, 'fade'), item('b', 300)], tracks, { fpsNum: 30, fpsDen: 1 });
    expect(plan.placements.map((placement) => placement.outputStartFrame)).toEqual([0, 300]);
    expect(plan.totalFrames).toBe(390);
    expect(plan.warnings[0]).toContain('contiguous clips');
  });
});
