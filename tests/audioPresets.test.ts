import { describe, expect, it } from 'vitest';
import { audioFilterForPreset } from '../core/audioPresets.js';

describe('audioFilterForPreset', () => {
  it('returns a podcast chain with cleanup and loudness', () => {
    const filter = audioFilterForPreset('podcast');
    expect(filter).toContain('highpass');
    expect(filter).toContain('acompressor');
    expect(filter).toContain('loudnorm');
    expect(filter).toContain('alimiter');
  });

  it('supports bypass', () => {
    expect(audioFilterForPreset('none')).toBeNull();
  });
});
