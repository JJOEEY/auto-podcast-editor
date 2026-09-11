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
  if (config.type === 'light-leak') {
    return <AbsoluteFill style={{ opacity: peak * 0.8, background: `linear-gradient(${35 + frame * 4}deg, transparent 15%, #fef08a 45%, #fb7185 58%, transparent 82%)`, mixBlendMode: 'screen' }} />;
  }
  if (config.type === 'whip') {
    const x = interpolate(frame, [0, config.durationFrames], [-120, 120], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return <AbsoluteFill style={{ opacity: peak, transform: `translateX(${x}%)`, filter: `blur(${Math.round(14 * peak)}px)`, background: '#111827' }} />;
  }
  if (config.type === 'shake') {
    const x = Math.sin(frame * 2.7) * 4 * peak;
    const y = Math.cos(frame * 3.1) * 3 * peak;
    return <AbsoluteFill style={{ opacity: peak, transform: `translate(${x}px, ${y}px)`, border: `${Math.round(12 * peak)}px solid #fff` }} />;
  }
  if (config.type === 'pixel-dissolve') {
    return <AbsoluteFill style={{ opacity: peak, background: `repeating-conic-gradient(#111827 0 8deg, #f8fafc 8deg 16deg)`, backgroundSize: `${Math.max(8, 80 - frame * 3)}px ${Math.max(8, 80 - frame * 3)}px`, mixBlendMode: 'screen' }} />;
  }
  if (config.type === 'shape-wipe') {
    const progress = interpolate(frame, [0, config.durationFrames], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return <AbsoluteFill style={{ background: '#000', opacity: peak, clipPath: `circle(${progress}% at 50% 50%)` }} />;
  }
  if (config.type === 'elastic-push') {
    const x = interpolate(frame, [0, config.durationFrames], [110, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const scale = 1 + Math.sin((frame / Math.max(1, config.durationFrames)) * Math.PI) * 0.08;
    return <AbsoluteFill style={{ opacity: peak, transform: `translateX(${x}%) scale(${scale})`, background: '#000' }} />;
  }
  return <AbsoluteFill style={{ background: color, opacity: peak }} />;
}
