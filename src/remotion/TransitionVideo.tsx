import { AbsoluteFill, Audio, OffthreadVideo, useCurrentFrame } from 'remotion';
import type { CSSProperties } from 'react';
import type { PlannedTransition, RenderClipPlacement } from '../../core/transitionPlan.ts';
import type { TransitionType } from '../../core/types.ts';

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smooth(value: number): number {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function transitionFrame(transition: PlannedTransition, frame: number, localStart: number): number {
  return smooth((frame - localStart) / Math.max(1, transition.durationFrames));
}

function directionalTransform(type: TransitionType, progress: number, entering: boolean): string | undefined {
  const direction = type === 'slide-right' || type === 'push-right' || type === 'whip' ? 1 : -1;
  const amount = entering ? direction * (1 - progress) * 100 : direction * progress * -100;
  if (type === 'slide-left' || type === 'slide-right' || type === 'push-left' || type === 'push-right' || type === 'whip') {
    const scale = type === 'whip' ? ` scale(${1 + (1 - progress) * 0.04})` : '';
    return `translateX(${amount}%)${scale}`;
  }
  if (type === 'elastic-push') {
    const overshoot = Math.sin(progress * Math.PI) * 8;
    return `translateX(${(entering ? direction * (1 - progress) * 100 : direction * progress * -100) + (entering ? overshoot * direction : -overshoot * direction)}%)`;
  }
  if (type === 'zoom') {
    return `scale(${entering ? 1.12 - progress * 0.12 : 1 + progress * 0.08})`;
  }
  if (type === 'shake') {
    const x = Math.sin(progress * Math.PI * 8) * 10 * (1 - progress);
    const y = Math.cos(progress * Math.PI * 7) * 7 * (1 - progress);
    return `translate(${x}px, ${y}px)`;
  }
  return undefined;
}

interface VisualEffect {
  opacity: number;
  transform?: string;
  filter?: string;
  clipPath?: string;
  overlay?: CSSProperties;
}

function visualEffect(type: TransitionType, progress: number, entering: boolean): VisualEffect {
  const p = clamp(progress);
  const transform = directionalTransform(type, p, entering);
  if (type === 'shape-wipe') {
    return { opacity: 1, clipPath: `circle(${Math.round((entering ? p : 1 - p) * 100)}% at 50% 50%)` };
  }
  if (type === 'wipe') {
    const x = entering ? (p - 1) * 100 : p * 100;
    return { opacity: 1, clipPath: `inset(0 ${entering ? 100 - Math.round(p * 100) : Math.round(p * 100)}% 0 0)`, transform: `translateX(${x}%)` };
  }
  if (type === 'blur') {
    return { opacity: 1, filter: `blur(${Math.round(Math.sin(p * Math.PI) * 18)}px)` };
  }
  if (type === 'glitch') {
    return {
      opacity: 1,
      transform,
      overlay: {
        background: `repeating-linear-gradient(${35 + Math.round(p * 70)}deg, rgba(239,68,68,.22) 0 8px, rgba(34,211,238,.22) 8px 16px, transparent 16px 24px)`,
        mixBlendMode: 'screen',
      },
    };
  }
  if (type === 'flash') {
    return { opacity: 1, overlay: { background: '#fff', opacity: Math.sin(p * Math.PI) * 0.85 } };
  }
  if (type === 'dip-black' || type === 'dip-white') {
    return { opacity: entering ? Math.max(0.05, p) : Math.max(0.05, 1 - p), overlay: { background: type === 'dip-white' ? '#fff' : '#000', opacity: Math.sin(p * Math.PI) } };
  }
  if (type === 'film-burn') {
    return { opacity: 1, overlay: { background: 'radial-gradient(circle at 50% 50%, rgba(249,115,22,.85), rgba(250,204,21,.55) 35%, transparent 72%)', mixBlendMode: 'screen', opacity: Math.sin(p * Math.PI) * 0.9 } };
  }
  if (type === 'light-leak') {
    return { opacity: 1, overlay: { background: `linear-gradient(${35 + Math.round(p * 80)}deg, transparent 15%, rgba(254,240,138,.7) 45%, rgba(251,113,133,.65) 58%, transparent 82%)`, mixBlendMode: 'screen', opacity: Math.sin(p * Math.PI) * 0.9 } };
  }
  if (type === 'pixel-dissolve') {
    return { opacity: 1, overlay: { background: 'repeating-conic-gradient(#111827 0 8deg, #f8fafc 8deg 16deg)', backgroundSize: `${Math.max(8, Math.round(80 - p * 60))}px ${Math.max(8, Math.round(80 - p * 60))}px`, mixBlendMode: 'screen', opacity: Math.sin(p * Math.PI) * 0.7 } };
  }
  return { opacity: entering ? p : 1 - p, transform };
}

export function TransitionVideo({ sourcePath, placement, volume = 1, audioSourcePath, audioVolume = 1 }: { sourcePath: string; placement: RenderClipPlacement; volume?: number; audioSourcePath?: string; audioVolume?: number }): JSX.Element {
  const frame = useCurrentFrame();
  const incomingStart = 0;
  const outgoingStart = placement.outgoing ? placement.outgoing.startFrame - placement.outputStartFrame : Number.POSITIVE_INFINITY;
  const incomingActive = Boolean(placement.incoming && frame < placement.incoming.durationFrames);
  const outgoingActive = Boolean(placement.outgoing && frame >= outgoingStart);
  const incomingEffect = placement.incoming && incomingActive ? visualEffect(placement.incoming.type, transitionFrame(placement.incoming, frame, incomingStart), true) : null;
  const outgoingEffect = placement.outgoing && outgoingActive ? visualEffect(placement.outgoing.type, transitionFrame(placement.outgoing, frame, outgoingStart), false) : null;
  const effect = incomingEffect ?? outgoingEffect;
  const transitionOpacity = incomingEffect && outgoingEffect
    ? Math.min(incomingEffect.opacity, outgoingEffect.opacity)
    : effect?.opacity ?? 1;
  const style: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: transitionOpacity,
    transform: effect?.transform,
    filter: effect?.filter,
    clipPath: effect?.clipPath,
  };
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#000' }}>
      <OffthreadVideo src={sourcePath} trimBefore={Math.max(0, placement.sourceInFrame)} volume={audioSourcePath ? 0 : volume} style={style} onError={(error) => console.error('Player video error', error)} />
      {audioSourcePath && <Audio src={audioSourcePath} trimBefore={Math.max(0, placement.sourceInFrame)} volume={audioVolume} />}
      {effect?.overlay && <AbsoluteFill style={effect.overlay} />}
    </AbsoluteFill>
  );
}
