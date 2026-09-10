import { describe, expect, it } from 'vitest';
import { compressTimeline, TIMELINE_FPS } from '../core/compressedTimeline.js';
import type { CaptionLine, Clip } from '../core/types.js';

const v = (id: string, start: number, end: number): Clip => ({ id, track: 'V1', start, end, label: id });
const cc = (id: string, start: number, end: number): CaptionLine => ({ id, start, end, text: id });

describe('compressTimeline', () => {
  it('closes gaps between keep segments', () => {
    const out = compressTimeline([v('k1', 0, 10), v('k2', 20, 100)], []);
    expect(out.video.map((p) => [p.outStart, p.outEnd])).toEqual([[0, 10], [10, 90]]);
    expect(out.totalFrames).toBe(90 * TIMELINE_FPS);
  });

  it('shifts captions by removed time', () => {
    const out = compressTimeline([v('k1', 0, 10), v('k2', 20, 100)], [cc('c1', 21, 23)]);
    expect(out.captions).toHaveLength(1);
    expect([out.captions[0].outStart, out.captions[0].outEnd]).toEqual([11, 13]);
  });

  it('clips captions spanning a cut and drops fully-removed ones', () => {
    const out = compressTimeline([v('k1', 0, 10), v('k2', 20, 100)], [cc('span', 8, 25), cc('gone', 12, 15)]);
    const span = out.captions.filter((p) => p.item.id === 'span');
    expect(span.map((p) => [p.outStart, p.outEnd])).toEqual([[8, 10], [10, 15]]);
    expect(out.captions.some((p) => p.item.id === 'gone')).toBe(false);
  });

  it('handles empty input and unsorted clips', () => {
    expect(compressTimeline([], []).totalFrames).toBe(1);
    const out = compressTimeline([v('b', 20, 30), v('a', 0, 10)], []);
    expect(out.video.map((p) => p.item.id)).toEqual(['a', 'b']);
    expect(out.video[1].outStart).toBe(10);
  });
});
