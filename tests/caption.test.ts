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

describe('chunkCaption edge cases', () => {
  const w = (n: number, startAt = 0) =>
    Array.from({ length: n }, (_, i) => ({ text: `w${i}`, start: startAt + i * 0.4, end: startAt + i * 0.4 + 0.3 }));

  it('returns [] for empty input', () => {
    expect(chunkCaption([])).toEqual([]);
  });

  it('flushes at 7 words without punctuation (orphan documented: 7+1)', () => {
    const lines = chunkCaption(w(8));
    expect(lines.map((l) => l.text.split(' ').length)).toEqual([7, 1]);
  });

  it('emits trailing partial line', () => {
    const lines = chunkCaption(w(3));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('w0 w1 w2');
  });

  it('breaks on …? and trailing closers once 5+ words', () => {
    const words = [...w(5), { text: 'thật…?', start: 2.0, end: 2.3 }, ...w(2, 2.4)];
    const lines = chunkCaption(words);
    expect(lines[0].text.endsWith('thật…?')).toBe(true);
    // trailing words force the break: old regex leaves 'rồi."' mid-line
    const words2 = [...w(5), { text: 'rồi."', start: 2.0, end: 2.3 }, ...w(3, 2.4)];
    const lines2 = chunkCaption(words2);
    expect(lines2[0].text.endsWith('rồi."')).toBe(true);
    expect(lines2).toHaveLength(2);
  });

  it('emits unique ms-precision ids', () => {
    const lines = chunkCaption(w(20));
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^cc-\d+$/);
  });
});
