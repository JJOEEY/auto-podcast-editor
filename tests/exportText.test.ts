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
