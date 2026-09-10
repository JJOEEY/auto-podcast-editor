export type VoicePreset = 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm';

export function audioFilterForPreset(preset: VoicePreset): string | null {
  if (preset === 'none') return null;
  const clean = 'highpass=f=75,afftdn=nr=10';
  const eq = preset === 'warm'
    ? 'equalizer=f=250:t=q:w=1:g=1,equalizer=f=3500:t=q:w=1:g=1'
    : 'equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1:g=2';
  const compression = preset === 'broadcast'
    ? 'acompressor=threshold=-21dB:ratio=4:attack=10:release=150'
    : 'acompressor=threshold=-18dB:ratio=3:attack=20:release=180';
  return `${clean},${eq},${compression},loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.95`;
}
