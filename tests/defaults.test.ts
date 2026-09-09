import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../core/defaults.js';

describe('DEFAULT_SETTINGS', () => {
  it('matches approved spec section 10', () => {
    expect(DEFAULT_SETTINGS.silenceSec).toBe(0.6);
    expect(DEFAULT_SETTINGS.fillerMaxSec).toBe(1.0);
    expect(DEFAULT_SETTINGS.lowAudioDb).toBe(-40);
    expect(DEFAULT_SETTINGS.topicPauseSec).toBe(2.0);
    expect(DEFAULT_SETTINGS.model).toBe('base');
  });
});
