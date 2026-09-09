import { describe, expect, it } from 'vitest';
import { createDefaultSettings, DEFAULT_SETTINGS, SETTINGS_RANGES } from '../core/defaults.js';

describe('DEFAULT_SETTINGS', () => {
  it('matches approved spec section 10', () => {
    expect(DEFAULT_SETTINGS.silenceSec).toBe(0.6);
    expect(DEFAULT_SETTINGS.fillerMaxSec).toBe(1.0);
    expect(DEFAULT_SETTINGS.lowAudioDb).toBe(-40);
    expect(DEFAULT_SETTINGS.topicPauseSec).toBe(2.0);
    expect(DEFAULT_SETTINGS.model).toBe('base');
  });
});

describe('settings ranges', () => {
  it('keeps every default inside its range', () => {
    expect(DEFAULT_SETTINGS.silenceSec).toBeGreaterThanOrEqual(SETTINGS_RANGES.silenceSec.min);
    expect(DEFAULT_SETTINGS.silenceSec).toBeLessThanOrEqual(SETTINGS_RANGES.silenceSec.max);
    expect(DEFAULT_SETTINGS.fillerMaxSec).toBeGreaterThanOrEqual(SETTINGS_RANGES.fillerMaxSec.min);
    expect(DEFAULT_SETTINGS.fillerMaxSec).toBeLessThanOrEqual(SETTINGS_RANGES.fillerMaxSec.max);
    expect(DEFAULT_SETTINGS.topicPauseSec).toBeGreaterThanOrEqual(SETTINGS_RANGES.topicPauseSec.min);
    expect(DEFAULT_SETTINGS.topicPauseSec).toBeLessThanOrEqual(SETTINGS_RANGES.topicPauseSec.max);
  });
});

describe('createDefaultSettings', () => {
  it('returns independent copies', () => {
    const a = createDefaultSettings();
    a.silenceSec = 9;
    expect(createDefaultSettings().silenceSec).toBe(DEFAULT_SETTINGS.silenceSec);
  });

  it('leaves the shared default frozen', () => {
    expect(() => {
      (DEFAULT_SETTINGS as { silenceSec: number }).silenceSec = 9;
    }).toThrow(TypeError);
  });
});
