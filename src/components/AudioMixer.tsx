import type { Track } from '../../core/types.js';

interface Props {
  tracks: Track[];
  voicePreset: 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm';
  onVoicePreset: (preset: Props['voicePreset']) => void;
  onMute: (id: string, muted: boolean) => void;
  onSolo: (id: string, solo: boolean) => void;
  onVolume: (id: string, volumeDb: number) => void;
}

export function AudioMixer({ tracks, voicePreset, onVoicePreset, onMute, onSolo, onVolume }: Props): JSX.Element {
  const audioTracks = tracks.filter((track) => track.kind === 'audio' || track.kind === 'sfx');
  return (
    <section className="audio-mixer">
      <div className="panel-header"><h2>Âm thanh</h2><span className="badge">A1–A3</span></div>
      <label className="audio-preset">
        <span>Voice preset</span>
        <select value={voicePreset} onChange={(event) => onVoicePreset(event.target.value as Props['voicePreset'])}>
          <option value="none">Gốc</option>
          <option value="clean">Clean</option>
          <option value="podcast">Podcast</option>
          <option value="broadcast">Broadcast</option>
          <option value="warm">Warm</option>
        </select>
      </label>
      <div>
        {audioTracks.map((track) => (
          <div key={track.id} data-audio-track={track.id} className="audio-track">
            <strong>{track.name}</strong>
            <button type="button" onClick={() => onMute(track.id, !track.muted)}>{track.muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" onClick={() => onSolo(track.id, !track.solo)}>{track.solo ? 'Unsolo' : 'Solo'}</button>
            <input aria-label={`Volume ${track.id}`} type="range" min={-24} max={12} step={1} value={track.volumeDb ?? 0} onChange={(event) => onVolume(track.id, Number(event.target.value))} />
            <span>{track.volumeDb ?? 0} dB</span>
          </div>
        ))}
      </div>
      {audioTracks.length === 0 && <p>Chưa có audio track.</p>}
    </section>
  );
}
