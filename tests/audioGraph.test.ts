import { describe, expect, it } from 'vitest';
import { buildAudioGraphPlan, buildAudioMixFilter, buildSidechainFilter, compileAudioChain, volumeFilter } from '../core/audioGraph.js';

describe('audio graph', () => {
  it('compiles an enhancement chain into FFmpeg filters', () => {
    const filter = compileAudioChain({
      id: 'voice', trackId: 'A1', enabled: true,
      denoise: { enabled: true, amount: 10 }, highpassHz: 75,
      eq: [{ frequency: 3500, gainDb: 2, q: 1 }],
      compressor: { enabled: true, thresholdDb: -18, ratio: 3, attackMs: 20, releaseMs: 180 },
      limiter: { enabled: true, ceilingDb: -1 },
    });
    expect(filter).toContain('afftdn');
    expect(filter).toContain('equalizer');
    expect(filter).toContain('acompressor');
    expect(filter).toContain('alimiter');
  });

  it('includes an explicit chain gain when configured', () => {
    expect(compileAudioChain({ id: 'voice', trackId: 'A1', enabled: true, volumeDb: -6 })).toContain('volume=-6dB');
    expect(volumeFilter(3)).toBe('volume=3dB');
  });

  it('builds a graph plan with optional ducking', () => {
    const plan = buildAudioGraphPlan({
      voiceTrackId: 'A1', voicePreset: 'podcast',
      ducking: { enabled: true, voiceTrackId: 'A1', backgroundTrackIds: ['A2'], threshold: 0.04, ratio: 8, attackMs: 20, releaseMs: 250 },
    });
    expect(plan.voiceFilter).toContain('loudnorm');
    expect(plan.ducking?.backgroundTrackIds).toEqual(['A2']);
    expect(buildSidechainFilter(plan.ducking!)).toContain('sidechaincompress');
  });

  it('rejects invalid sidechain settings', () => {
    expect(() => buildSidechainFilter({ enabled: true, voiceTrackId: 'A1', backgroundTrackIds: [], threshold: 0.04, ratio: 8, attackMs: 20, releaseMs: 250 })).toThrow('voice and background');
  });

  it('compiles a real voice/background sidechain graph with optional voice processing', () => {
    const filter = buildAudioMixFilter({
      voiceLabel: 'voice0',
      backgroundLabels: ['bg0', 'bg1'],
      voiceFilter: 'highpass=f=75',
      ducking: { enabled: true, voiceTrackId: 'A1', backgroundTrackIds: ['A2'], threshold: 0.04, ratio: 8, attackMs: 20, releaseMs: 250 },
    });
    expect(filter).toContain('[bg0][bg1]amix=inputs=2');
    expect(filter).toContain('[bgmix][voice0voice]sidechaincompress');
    expect(filter).toContain('[voice0voice][ducked]amix=inputs=2');
  });
});
