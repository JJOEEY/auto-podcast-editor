import { describe, expect, it } from 'vitest';
import { parseWhisperJson } from '../core/whisperJson.js';

const sample = {
  transcription: [
    {
      timestamps: { from: '00:00:00,000', to: '00:00:02,000' },
      text: ' xin chào các bạn',
      tokens: [
        { text: '[_BEG_]', timestamps: { from: '00:00:00,000', to: '00:00:00,000' }, offsets: { from: 0, to: 0 }, id: 50363, p: 0.8 },
        { text: ' xin', timestamps: { from: '00:00:00,320', to: '00:00:00,370' }, offsets: { from: 320, to: 370 }, id: 1, p: 0.9 },
        { text: ' chào', timestamps: { from: '00:00:00,400', to: '00:00:00,700' }, offsets: { from: 400, to: 700 }, id: 2, p: 0.95 },
        { text: '  ', timestamps: { from: '00:00:00,700', to: '00:00:00,700' }, offsets: { from: 700, to: 700 }, id: 3, p: 0.1 },
      ],
    },
  ],
};

describe('parseWhisperJson', () => {
  it('maps tokens to words, skipping specials and empties', () => {
    expect(parseWhisperJson(sample)).toEqual([
      { text: 'xin', start: 0.32, end: 0.37 },
      { text: 'chào', start: 0.4, end: 0.7 },
    ]);
  });

  it('throws on non-object and missing transcription', () => {
    expect(() => parseWhisperJson(null)).toThrow('invalid whisper transcript');
    expect(() => parseWhisperJson({})).toThrow('missing transcription');
    expect(() => parseWhisperJson([])).toThrow('invalid whisper transcript');
  });

  it('skips tokens with bad offsets', () => {
    const bad = { transcription: [{ tokens: [{ text: 'x' }, { text: 'y', offsets: { from: 5, to: 5 } }] }] };
    expect(parseWhisperJson(bad)).toEqual([]);
  });
});
