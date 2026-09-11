import { transitionConfig } from './effects.ts';
import { requiredHandleFrames } from './timeline.ts';
import type { Timebase, TimelineItem, Track, TransitionConfig, TransitionType } from './types.ts';

export interface PlannedTransition {
  type: TransitionType;
  durationFrames: number;
  startFrame: number;
}

export interface RenderClipPlacement {
  item: TimelineItem;
  outputStartFrame: number;
  outputDurationFrames: number;
  sourceInFrame: number;
  sourceOutFrame: number;
  incoming?: PlannedTransition;
  outgoing?: PlannedTransition;
  fallbackReason?: string;
}

export interface TransitionPlan {
  placements: RenderClipPlacement[];
  totalFrames: number;
  warnings: string[];
}

function fps(timebase: Timebase): number {
  return timebase.fpsNum / timebase.fpsDen;
}

function transitionFor(item: TimelineItem): TransitionConfig | null {
  if (!item.transitionKind || item.transitionKind === 'hard-cut') return null;
  const effect = item.effects?.find((candidate) => candidate.type === item.transitionKind);
  const duration = effect && typeof effect.params.durationFrames === 'number' ? Math.round(effect.params.durationFrames) : transitionConfig(item.transitionKind).durationFrames;
  return duration > 0 ? { type: item.transitionKind, durationFrames: duration } : null;
}

function hasHandles(item: TimelineItem, transition: TransitionConfig, side: 'before' | 'after'): boolean {
  const required = requiredHandleFrames(transition.type);
  const available = side === 'before' ? item.source?.handleBeforeFrames : item.source?.handleAfterFrames;
  return (available ?? 0) >= required;
}

export function buildTransitionPlan(items: TimelineItem[], tracks: Track[], timebase: Timebase): TransitionPlan {
  const videoItems = items
    .filter((item) => tracks.find((track) => track.id === item.trackId)?.kind === 'video')
    .sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));
  const warnings: string[] = [];
  const transitions: Array<{ config: TransitionConfig | null; overlap: number; beforeFrames: number; afterFrames: number }> = [];
  for (let index = 0; index < videoItems.length; index += 1) {
    const current = videoItems[index];
    const next = videoItems[index + 1];
    const config = next ? transitionFor(current) : null;
    if (!config || !next) {
      transitions.push({ config: null, overlap: 0, beforeFrames: 0, afterFrames: 0 });
      continue;
    }
    const contiguous = current.startFrame + current.durationFrames === next.startFrame;
    const maxOverlap = Math.min(config.durationFrames, current.durationFrames, next.durationFrames);
    const valid = contiguous && maxOverlap > 0 && hasHandles(current, config, 'after') && hasHandles(next, config, 'before');
    if (!valid) {
      const reason = contiguous
        ? `insufficient handles for ${config.type} between ${current.id} and ${next.id}`
        : `transition requires contiguous clips between ${current.id} and ${next.id}`;
      warnings.push(reason);
      transitions.push({ config: null, overlap: 0, beforeFrames: 0, afterFrames: 0 });
      continue;
    }
    const beforeFrames = Math.floor(maxOverlap / 2);
    transitions.push({ config, overlap: maxOverlap, beforeFrames, afterFrames: maxOverlap - beforeFrames });
  }

  const placements: RenderClipPlacement[] = [];
  for (let index = 0; index < videoItems.length; index += 1) {
    const item = videoItems[index];
    const previous = transitions[index - 1];
    const next = transitions[index];
    const incomingFrames = previous?.afterFrames ?? 0;
    const outgoingFrames = next?.beforeFrames ?? 0;
    const sourceIn = Math.round((item.source?.sourceIn ?? item.startFrame / fps(timebase)) * fps(timebase));
    const sourceOut = Math.round((item.source?.sourceOut ?? (item.startFrame + item.durationFrames) / fps(timebase)) * fps(timebase));
    const outputStartFrame = item.startFrame - incomingFrames;
    const incoming = previous?.config ? { type: previous.config.type, durationFrames: previous.overlap, startFrame: outputStartFrame } : undefined;
    const outputDurationFrames = item.durationFrames + incomingFrames + outgoingFrames;
    const outgoing = next?.config ? { type: next.config.type, durationFrames: next.overlap, startFrame: outputStartFrame + incomingFrames + item.durationFrames - next.beforeFrames } : undefined;
    placements.push({
      item,
      outputStartFrame,
      outputDurationFrames,
      sourceInFrame: sourceIn - incomingFrames,
      sourceOutFrame: sourceOut + outgoingFrames,
      incoming,
      outgoing,
      fallbackReason: item.transitionKind && next?.config === null && index < videoItems.length - 1 ? warnings.find((warning) => warning.includes(item.id)) : undefined,
    });
  }
  return { placements, totalFrames: Math.max(1, placements.reduce((max, placement) => Math.max(max, placement.outputStartFrame + placement.outputDurationFrames), 0)), warnings };
}
