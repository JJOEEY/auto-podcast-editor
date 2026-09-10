import type { CaptionLine, Clip } from './types.js';

export const TIMELINE_FPS = 30;

export interface Placed<T> { item: T; outStart: number; outEnd: number; }

export interface CompressedTimeline {
  video: Placed<Clip>[];
  captions: Placed<CaptionLine>[];
  totalFrames: number;
}

export function compressTimeline(clips: Clip[], captions: CaptionLine[], fps = TIMELINE_FPS): CompressedTimeline {
  const sorted = [...clips].filter((c) => c.track === 'V1').sort((a, b) => a.start - b.start);
  let cursor = 0;
  const video: Placed<Clip>[] = sorted.map((c) => {
    const dur = Math.max(0, c.end - c.start);
    const p = { item: c, outStart: cursor, outEnd: cursor + dur };
    cursor += dur;
    return p;
  });
  const placedCaps: Placed<CaptionLine>[] = [];
  for (const cap of captions) {
    for (const keeper of video) {
      const s = Math.max(cap.start, keeper.item.start);
      const e = Math.min(cap.end, keeper.item.end);
      if (e - s <= 0) continue;
      const offset = keeper.outStart - keeper.item.start;
      placedCaps.push({ item: cap, outStart: s + offset, outEnd: e + offset });
    }
  }
  placedCaps.sort((a, b) => a.outStart - b.outStart);
  return { video, captions: placedCaps, totalFrames: Math.max(1, Math.round(cursor * fps)) };
}
