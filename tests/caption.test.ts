import { describe, expect, it } from 'vitest';
import { chunkCaption } from '../core/caption.js';

describe('chunkCaption', () => {
  it('packs 5-7 words per line and breaks at sentence end', () => {
    const words = 'một hai ba bốn năm sáu. bảy tám chín mười mười một mười hai mười ba'.split(' ')
      .map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.3 }));
    const lines = chunkCaption(words);
    expect(lines[0].text).toBe('một hai ba bốn năm sáu.');
    expect(lines[1].text.split(' ').length).toBeLessThanOrEqual(7);
    expect(lines[0].start).toBe(0);
  });
});
