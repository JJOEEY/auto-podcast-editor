import type { SfxClip } from '../../core/types.js';

interface Props {
  clips: SfxClip[];
  onUpdate: (id: string, patch: Partial<Omit<SfxClip, 'id'>>) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

export function SfxEditor({ clips, onUpdate, onDuplicate, onRemove }: Props): JSX.Element {
  return (
    <section className="sfx-editor">
      <div className="panel-header"><h3>SFX trên timeline</h3><span className="badge">A3</span></div>
      {clips.map((clip) => (
        <div key={clip.id} data-sfx-clip={clip.id} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, minmax(70px, 110px)) auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span title={clip.path}>{clip.category ?? clip.id}</span>
          <label>Start <input aria-label={`Start ${clip.id}`} type="number" min="0" step="0.01" value={clip.start} onChange={(event) => onUpdate(clip.id, { start: Math.max(0, Number(event.target.value)) })} /></label>
          <label>Dur <input aria-label={`Duration ${clip.id}`} type="number" min="0.05" step="0.01" value={clip.duration} onChange={(event) => onUpdate(clip.id, { duration: Math.max(0.05, Number(event.target.value)) })} /></label>
          <label>Track <select aria-label={`Track ${clip.id}`} value={clip.trackId ?? 'A3'} onChange={(event) => onUpdate(clip.id, { trackId: event.target.value })}><option value="A2">Music</option><option value="A3">SFX</option></select></label>
          <label>Vol <input aria-label={`Volume ${clip.id}`} type="number" min="0" max="4" step="0.05" value={clip.volume} onChange={(event) => onUpdate(clip.id, { volume: Math.max(0, Number(event.target.value)) })} /></label>
          <label>Fade in <input aria-label={`Fade in ${clip.id}`} type="number" min="0" step="0.01" value={clip.fadeInSec ?? 0} onChange={(event) => onUpdate(clip.id, { fadeInSec: Math.max(0, Number(event.target.value)) })} /></label>
          <label>Fade out <input aria-label={`Fade out ${clip.id}`} type="number" min="0" step="0.01" value={clip.fadeOutSec ?? 0} onChange={(event) => onUpdate(clip.id, { fadeOutSec: Math.max(0, Number(event.target.value)) })} /></label>
          <label><input type="checkbox" checked={Boolean(clip.muted)} onChange={(event) => onUpdate(clip.id, { muted: event.target.checked })} /> Mute</label>
          <button type="button" onClick={() => onDuplicate(clip.id)}>Duplicate</button>
          <button type="button" onClick={() => onRemove(clip.id)}>Delete</button>
        </div>
      ))}
      {clips.length === 0 && <p>Chưa có SFX trên timeline.</p>}
    </section>
  );
}
