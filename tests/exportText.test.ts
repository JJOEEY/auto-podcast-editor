import { describe, expect, it } from 'vitest';
import { buildCaptionTxt, buildSrt } from '../core/exportText.js';

describe('buildSrt', () => {
  it('formats lines with SRT timestamps', () => {
    const srt = buildSrt([{ id: 'cc-0', start: 61.5, end: 63.25, text: 'xin chào' }]);
    expect(srt).toContain('00:01:01,500 --> 00:01:03,250');
    expect(srt).toContain('xin chào');
  });
});

describe('buildCaptionTxt', () => {
  it('appends exactly 4 hashtags', () => {
    const out = buildCaptionTxt('Tập 1 podcast', ['#podcast', '#vietnam', '#tips', '#xuhuong']);
    expect(out).toContain('Tập 1 podcast');
    expect(out.match(/#/g)).toHaveLength(4);
  });
});

describe('buildSrt edges', () => {
  it('carries rounding into minutes', () => {
    const srt = buildSrt([{ id: 'cc-1', start: 59.9999, end: 60.5, text: 'x' }]);
    expect(srt).toContain('00:01:00,000 --> 00:01:00,500');
  });

  it('separates cues with blank lines and terminates the file', () => {
    const srt = buildSrt([
      { id: 'cc-1', start: 0, end: 1, text: 'one' },
      { id: 'cc-2', start: 2, end: 3, text: 'two' },
    ]);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:01,000\none\n\n2\n00:00:02,000 --> 00:00:03,000\ntwo\n\n');
  });

  it('returns empty string for no lines', () => {
    expect(buildSrt([])).toBe('');
  });

  it('rejects invalid timestamps', () => {
    expect(() => buildSrt([{ id: 'cc-x', start: 5, end: 3, text: 'bad' }])).toThrow(RangeError);
    expect(() => buildSrt([{ id: 'cc-x', start: NaN, end: 3, text: 'bad' }])).toThrow(RangeError);
  });
});

describe('buildCaptionTxt edges', () => {
  it('rejects wrong hashtag count and malformed tags', () => {
    expect(() => buildCaptionTxt('t', ['#a', '#b'])).toThrow();
    expect(() => buildCaptionTxt('t', ['podcast', '#b', '#c', '#d'])).toThrow();
    expect(() => buildCaptionTxt('t', ['#', '#b', '#c', '#d'])).toThrow();
    expect(() => buildCaptionTxt('t', ['#a b', '#b', '#c', '#d'])).toThrow();
  });
});
