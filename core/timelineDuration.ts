import type { SfxClip, TimelineItem, Track, Timebase, Clip, CaptionLine } from './types.js';
import { buildTransitionPlan } from './transitionPlan.ts';

export function timelineDurationFrames(options: {
  items?: TimelineItem[];
  tracks?: Track[];
  clips?: Clip[];
  captions?: CaptionLine[];
  sfx?: SfxClip[];
  timebase?: Timebase;
}): number {
  const fps = (options.timebase?.fpsNum ?? 30) / (options.timebase?.fpsDen ?? 1);
  let endFrame = 0;
  if (options.items?.length && options.tracks?.length) {
    endFrame = buildTransitionPlan(options.items, options.tracks, options.timebase ?? { fpsNum: 30, fpsDen: 1 }).totalFrames;
    for (const item of options.items) endFrame = Math.max(endFrame, item.startFrame + item.durationFrames);
  } else {
    for (const clip of options.clips ?? []) endFrame = Math.max(endFrame, Math.round(clip.end * fps));
    for (const caption of options.captions ?? []) endFrame = Math.max(endFrame, Math.round(caption.end * fps));
  }
  for (const sfx of options.sfx ?? []) endFrame = Math.max(endFrame, Math.round((sfx.start + sfx.duration) * fps));
  return Math.max(1, endFrame);
}
