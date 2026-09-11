import { describe, expect, it } from 'vitest';
import { DEFAULT_WHISPER_PROFILES, resolveWhisperProfile } from '../core/whisperProfiles.js';

describe('whisper profiles', () => {
  it('includes base, small and small+DTW in the official default matrix', () => {
    expect(DEFAULT_WHISPER_PROFILES).toEqual(['base', 'small', 'small+DTW']);
  });

  it('resolves small+DTW to the tested alignment-safe CLI profile', () => {
    expect(resolveWhisperProfile('small+DTW')).toEqual({
      id: 'small+DTW',
      outputKey: 'small-dtw',
      modelTier: 'small',
      args: ['--max-len', '1', '--word-thold', '0.10', '--no-flash-attn', '--dtw', 'small'],
    });
    expect(resolveWhisperProfile('small+dtw')).toEqual(resolveWhisperProfile('small+DTW'));
  });

  it('keeps generic model tiers available for local experiments', () => {
    expect(resolveWhisperProfile('base')).toEqual({ id: 'base', outputKey: 'base', modelTier: 'base', args: ['--max-len', '1'] });
  });

  it('rejects unsafe profile names', () => {
    expect(() => resolveWhisperProfile('../small')).toThrow('không hợp lệ');
  });
});
