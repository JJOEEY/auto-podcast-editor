import type { CaptionLine, Clip } from './types.ts';

export const TIMELINE_FPS = 30;

export interface Placed<T> {
  item: T;
  outStart: number;
  outEnd: number;
  sourceStart?: number;
  sourceEnd?: number;
}

export interface CompressedTimeline {
  video: Placed<Clip>[];
  captions: Placed<CaptionLine>[];
  totalFrames: number;
}

export interface FrameSpan { from: number; dur: number; }

export function toFrames(outStart: number, outEnd: number, fps = TIMELINE_FPS): FrameSpan {
  const from = Math.round(outStart * fps);
  return { from, dur: Math.max(1, Math.round(outEnd * fps) - from) };
}

// Callers must supply disjoint V1 keepers (sorted internally); overlapping keepers are out of contract.
export function compressTimeline(clips: Clip[], captions: CaptionLine[], fps = TIMELINE_FPS): CompressedTimeline {
  const sorted = [...clips].filter((c) => c.track === 'V1').sort((a, b) => a.start - b.start);
  let cursor = 0;
  const video: Placed<Clip>[] = [];
  for (const c of sorted) {
    const dur = c.end - c.start;
    if (dur <= 0) continue;
    const p = { item: c, outStart: cursor, outEnd: cursor + dur, sourceStart: c.start, sourceEnd: c.end };
    cursor += dur;
    video.push(p);
  }
  const placedCaps: Placed<CaptionLine>[] = [];
  for (const cap of captions) {
    for (const keeper of video) {
      const s = Math.max(cap.start, keeper.item.start);
      const e = Math.min(cap.end, keeper.item.end);
      if (e - s <= 0) continue;
      const offset = keeper.outStart - keeper.item.start;
      placedCaps.push({ item: cap, outStart: s + offset, outEnd: e + offset, sourceStart: s, sourceEnd: e });
    }
  }
  placedCaps.sort((a, b) => a.outStart - b.outStart);
  return { video, captions: placedCaps, totalFrames: Math.max(1, Math.round(cursor * fps)) };
}
