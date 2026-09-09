import type { Settings } from './types.js';

export const DEFAULT_SETTINGS: Settings = {
  silenceSec: 0.6,
  fillerMaxSec: 1.0,
  lowAudioDb: -40,
  topicPauseSec: 2.0,
  model: 'base',
};

export const SETTINGS_RANGES = {
  silenceSec: { min: 0.3, max: 1.5 },
  fillerMaxSec: { min: 0.5, max: 2.0 },
  topicPauseSec: { min: 1.0, max: 4.0 },
} as const;
