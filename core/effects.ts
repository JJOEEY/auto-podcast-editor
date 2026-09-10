import type { Clip, CutProposal, TransitionConfig, TransitionType } from './types.js';

export const TRANSITION_PRESETS: Array<{ id: TransitionType; label: string; durationFrames: number }> = [
  { id: 'hard-cut', label: 'Hard cut', durationFrames: 0 },
  { id: 'fade', label: 'Fade', durationFrames: 10 },
  { id: 'dip-black', label: 'Dip black', durationFrames: 12 },
  { id: 'dip-white', label: 'Dip white', durationFrames: 12 },
  { id: 'slide-left', label: 'Slide left', durationFrames: 14 },
  { id: 'slide-right', label: 'Slide right', durationFrames: 14 },
  { id: 'push-left', label: 'Push left', durationFrames: 14 },
  { id: 'push-right', label: 'Push right', durationFrames: 14 },
  { id: 'wipe', label: 'Wipe', durationFrames: 14 },
  { id: 'zoom', label: 'Zoom', durationFrames: 12 },
  { id: 'blur', label: 'Blur', durationFrames: 12 },
  { id: 'glitch', label: 'Glitch', durationFrames: 8 },
  { id: 'flash', label: 'Flash', durationFrames: 6 },
  { id: 'film-burn', label: 'Film burn', durationFrames: 18 },
];

export function transitionConfig(type: TransitionType): TransitionConfig {
  const preset = TRANSITION_PRESETS.find((item) => item.id === type);
  return preset ? { type: preset.id, durationFrames: preset.durationFrames } : { type, durationFrames: 0 };
}

/** Assigns a restrained transition only to cuts preceded by a long removed pause. */
export function decorateTransitions(clips: Clip[], proposals: CutProposal[]): Clip[] {
  return clips.map((clip, index) => {
    if (index === clips.length - 1) return { ...clip };
    const next = clips[index + 1];
    const longPause = proposals.some((proposal) => proposal.start >= clip.end && proposal.end <= next.start && proposal.end - proposal.start >= 2);
    return { ...clip, transitionOut: longPause ? transitionConfig('fade') : transitionConfig('hard-cut') };
  });
}
