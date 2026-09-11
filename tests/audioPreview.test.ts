import { describe, expect, it } from 'vitest';
import { buildAudioPreviewFilter } from '../core/audioPreview.js';

describe('audio preview', () => {
  it('uses the same voice preset and chain filters as export', () => {
    const filter = buildAudioPreviewFilter({
      preset: 'podcast',
      chain: { id: 'voice', trackId: 'A1', enabled: true, volumeDb: -3, highpassHz: 80 },
    });
    expect(filter).toContain('highpass=f=75');
    expect(filter).toContain('highpass=f=80');
    expect(filter).toContain('volume=-3dB');
  });

  it('returns null for an unprocessed voice preview', () => {
    expect(buildAudioPreviewFilter({ preset: 'none' })).toBeNull();
  });
});
