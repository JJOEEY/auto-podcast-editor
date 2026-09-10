import { describe, expect, it } from 'vitest';
import { decorateTransitions, TRANSITION_PRESETS, transitionConfig } from '../core/effects.js';

describe('effects', () => {
  it('exposes a CapCut-like transition catalog', () => {
    expect(TRANSITION_PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(transitionConfig('glitch').durationFrames).toBeGreaterThan(0);
  });

  it('adds a fade after a long removed pause', () => {
    const clips = [
      { id: 'a', track: 'V1' as const, start: 0, end: 5, label: 'a' },
      { id: 'b', track: 'V1' as const, start: 8, end: 12, label: 'b' },
    ];
    const proposals = [{ id: 'p', start: 5, end: 8, kind: 'silence' as const, reason: 'pause', confidence: 1 }];
    expect(decorateTransitions(clips, proposals)[0].transitionOut?.type).toBe('fade');
  });
});
