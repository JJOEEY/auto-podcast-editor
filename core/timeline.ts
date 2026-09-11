import type { TimelineItem, Timebase, TransitionType } from './types.ts';

export const DEFAULT_TIMEBASE: Timebase = { fpsNum: 30, fpsDen: 1 };
export const SIMPLE_TRANSITION_HANDLE_FRAMES = 18;
export const COMPLEX_TRANSITION_HANDLE_FRAMES = 30;

const COMPLEX_TRANSITIONS = new Set<TransitionType>(['elastic-push', 'shape-wipe', 'pixel-dissolve']);

export function framesPerSecond(timebase: Timebase): number {
  if (!Number.isFinite(timebase.fpsNum) || !Number.isFinite(timebase.fpsDen) || timebase.fpsNum <= 0 || timebase.fpsDen <= 0) {
    throw new RangeError('invalid timebase');
  }
  return timebase.fpsNum / timebase.fpsDen;
}

export function requiredHandleFrames(transition?: TransitionType): number {
  if (!transition || transition === 'hard-cut') return 0;
  return COMPLEX_TRANSITIONS.has(transition) ? COMPLEX_TRANSITION_HANDLE_FRAMES : SIMPLE_TRANSITION_HANDLE_FRAMES;
}

export function requiredHandleSeconds(transition: TransitionType | undefined, timebase: Timebase = DEFAULT_TIMEBASE): number {
  return requiredHandleFrames(transition) / framesPerSecond(timebase);
}

export function isBoundaryTransition(transition?: TransitionType): boolean {
  return Boolean(transition && transition !== 'hard-cut');
}

export function validateTimelineItem(item: TimelineItem, timebase: Timebase = DEFAULT_TIMEBASE): string[] {
  const errors: string[] = [];
  if (!item.id.trim()) errors.push('timeline item id is required');
  if (!item.trackId.trim()) errors.push('timeline item track is required');
  if (!Number.isInteger(item.startFrame) || item.startFrame < 0) errors.push('timeline item startFrame must be a non-negative integer');
  if (!Number.isInteger(item.durationFrames) || item.durationFrames <= 0) errors.push('timeline item durationFrames must be a positive integer');
  const source = item.source;
  if (source) {
    if (!(source.sourceIn >= 0 && source.sourceOut > source.sourceIn)) errors.push('source range must have positive duration');
    if (!Number.isInteger(source.handleBeforeFrames) || source.handleBeforeFrames < 0) errors.push('handleBeforeFrames must be a non-negative integer');
    if (!Number.isInteger(source.handleAfterFrames) || source.handleAfterFrames < 0) errors.push('handleAfterFrames must be a non-negative integer');
    const required = requiredHandleFrames(item.transitionKind);
    if (isBoundaryTransition(item.transitionKind) && (source.handleBeforeFrames < required || source.handleAfterFrames < required)) {
      errors.push(`transition requires ${required} handle frames per side`);
    }
  }
  try {
    framesPerSecond(timebase);
  } catch {
    errors.push('invalid timebase');
  }
  return errors;
}

export function snapFrame(frame: number): number {
  if (!Number.isFinite(frame)) throw new RangeError('frame must be finite');
  return Math.max(0, Math.round(frame));
}

/** Removes a timeline interval and shifts later items left without mutating the input. */
export function rippleDelete(items: TimelineItem[], fromFrame: number, toFrame: number, trackIds?: Set<string>): TimelineItem[] {
  const start = snapFrame(fromFrame);
  const end = snapFrame(toFrame);
  if (end <= start) throw new RangeError('ripple delete range must be positive');
  const delta = end - start;
  const out: TimelineItem[] = [];
  for (const item of items) {
    if (trackIds && !trackIds.has(item.trackId)) {
      out.push({ ...item, source: item.source ? { ...item.source } : undefined });
      continue;
    }
    const itemEnd = item.startFrame + item.durationFrames;
    if (itemEnd <= start) {
      out.push({ ...item, source: item.source ? { ...item.source } : undefined });
      continue;
    }
    if (item.startFrame >= end) {
      out.push({ ...item, startFrame: item.startFrame - delta, source: item.source ? { ...item.source } : undefined });
      continue;
    }
    const left = Math.max(0, start - item.startFrame);
    const right = Math.max(0, itemEnd - end);
    if (left === 0 && right === 0) continue;
    const nextStart = item.startFrame < start ? item.startFrame : start;
    const nextDuration = left + right;
    if (nextDuration <= 0) continue;
    out.push({ ...item, startFrame: nextStart, durationFrames: nextDuration, source: item.source ? { ...item.source } : undefined });
  }
  return out.sort((a, b) => a.startFrame - b.startFrame || a.trackId.localeCompare(b.trackId));
}

export function timelineDurationFrames(items: TimelineItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.startFrame + item.durationFrames), 0);
}
