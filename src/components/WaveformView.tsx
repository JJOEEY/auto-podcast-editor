import type { WaveformCache } from '../../core/waveform.js';

interface Props {
  waveform: WaveformCache;
}

export function WaveformView({ waveform }: Props): JSX.Element {
  const width = 800;
  const height = 54;
  const step = waveform.peaks.length > 0 ? width / waveform.peaks.length : width;
  const bars = waveform.peaks.map((peak, index) => {
    const barHeight = Math.max(1, Math.min(height - 4, peak * (height - 4)));
    return <rect key={index} x={index * step} y={(height - barHeight) / 2} width={Math.max(0.5, step)} height={barHeight} fill="#67e8f9" opacity={0.85} />;
  });
  return <svg aria-label="Waveform audio" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height, background: '#082f49', borderRadius: 6 }}>{bars}</svg>;
}
