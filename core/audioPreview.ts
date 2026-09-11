import type { AudioChain } from './types.js';
import { audioFilterForPreset, type VoicePreset } from './audioPresets.js';
import { compileAudioChain } from './audioGraph.js';

export interface AudioPreviewOptions {
  preset: VoicePreset;
  chain?: AudioChain;
}

/** Returns the exact filter sequence used for the Player's processed voice preview. */
export function buildAudioPreviewFilter(options: AudioPreviewOptions): string | null {
  const filters = [audioFilterForPreset(options.preset), options.chain ? compileAudioChain(options.chain) : null]
    .filter((filter): filter is string => Boolean(filter));
  return filters.length > 0 ? filters.join(',') : null;
}
