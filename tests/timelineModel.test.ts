import { describe, expect, it } from 'vitest';
import { requiredHandleFrames, rippleDelete, timelineDurationFrames, validateTimelineItem } from '../core/timeline.js';
import type { TimelineItem } from '../core/types.js';

const item = (id: string, startFrame: number, durationFrames: number, trackId = 'V1'): TimelineItem => ({
  id,
  trackId,
  label: id,
  startFrame,
  durationFrames,
  source: { sourceIn: startFrame / 30, sourceOut: (startFrame + durationFrames) / 30, handleBeforeFrames: 18, handleAfterFrames: 18 },
});

describe('timeline model', () => {
  it('uses handle requirements by transition class', () => {
    expect(requiredHandleFrames('fade')).toBe(18);
    expect(requiredHandleFrames('elastic-push')).toBe(30);
    expect(requiredHandleFrames('hard-cut')).toBe(0);
  });

  it('validates boundary transition handles but allows internal effects without them', () => {
    const transition = { ...item('transition', 0, 60), transitionKind: 'elastic-push' as const, source: { sourceIn: 0, sourceOut: 2, handleBeforeFrames: 18, handleAfterFrames: 30 } };
    expect(validateTimelineItem(transition)).toContain('transition requires 30 handle frames per side');
    const internal = { ...item('internal', 0, 60), effects: [{ id: 'speed', type: 'speed-ramp', enabled: true, params: {} }] };
    expect(validateTimelineItem(internal)).toEqual([]);
  });

  it('ripple deletes an interval and shifts later items without mutation', () => {
    const items = [item('a', 0, 30), item('b', 60, 30), item('c', 120, 30)];
    const out = rippleDelete(items, 30, 60);
    expect(out.map((entry) => [entry.id, entry.startFrame, entry.durationFrames])).toEqual([
      ['a', 0, 30], ['b', 30, 30], ['c', 90, 30],
    ]);
    expect(items[1].startFrame).toBe(60);
    expect(timelineDurationFrames(out)).toBe(120);
  });

  it('can ripple only selected tracks', () => {
    const items = [item('video', 60, 30, 'V1'), item('audio', 60, 30, 'A1')];
    const out = rippleDelete(items, 30, 60, new Set(['V1']));
    expect(out.find((entry) => entry.id === 'video')?.startFrame).toBe(30);
    expect(out.find((entry) => entry.id === 'audio')?.startFrame).toBe(60);
  });
});
