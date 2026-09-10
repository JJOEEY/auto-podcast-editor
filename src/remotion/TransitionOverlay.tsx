import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { TransitionConfig } from '../../core/types.js';

export function TransitionOverlay({ config }: { config: TransitionConfig }): JSX.Element | null {
  if (config.type === 'hard-cut' || config.durationFrames <= 0) return null;
  const frame = useCurrentFrame();
  const half = config.durationFrames / 2;
  const intensity = config.intensity ?? 1;
  const peak = interpolate(frame, [0, half, config.durationFrames], [0, intensity, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const color = config.type === 'dip-white' || config.type === 'flash' ? '#fff' : '#000';
  if (config.type === 'slide-left' || config.type === 'slide-right' || config.type === 'push-left' || config.type === 'push-right' || config.type === 'wipe') {
    const direction = config.type === 'slide-right' || config.type === 'push-right' ? 1 : -1;
    const x = interpolate(frame, [0, config.durationFrames], [direction * 100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return <AbsoluteFill style={{ background: '#000', opacity: peak, transform: `translateX(${x}%)` }} />;
  }
  if (config.type === 'glitch') {
    return <AbsoluteFill style={{ opacity: peak, background: `repeating-linear-gradient(${45 + frame * 7}deg, #ef4444 0 8px, #22d3ee 8px 16px, #111827 16px 24px)`, mixBlendMode: 'screen' }} />;
  }
  if (config.type === 'zoom') {
    return <AbsoluteFill style={{ opacity: peak, border: `${Math.round(30 * peak)}px solid #fff`, transform: `scale(${1 + peak * 0.08})` }} />;
  }
  if (config.type === 'blur') {
    return <AbsoluteFill style={{ opacity: peak * 0.55, backdropFilter: `blur(${Math.round(20 * peak)}px)`, background: 'rgba(255,255,255,.15)' }} />;
  }
  if (config.type === 'film-burn') {
    return <AbsoluteFill style={{ opacity: peak * 0.8, background: 'radial-gradient(circle at 50% 50%, #f97316, #facc15 35%, transparent 70%)', mixBlendMode: 'screen' }} />;
  }
  return <AbsoluteFill style={{ background: color, opacity: peak }} />;
}
