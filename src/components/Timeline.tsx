import type { Clip } from '../../core/types.js';

interface Props {
  clips: Clip[];
  durationSec?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMove?: (id: string, delta: number) => void;
  onTrim?: (id: string, edge: 'start' | 'end', delta: number) => void;
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Timeline({ clips, durationSec = 1, selectedId, onSelect, onMove, onTrim, onSplit, onDelete }: Props): JSX.Element {
  const scale = Math.max(1, durationSec);
  return (
    <div data-timeline style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 16, background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Timeline</strong>
        <small>{durationSec.toFixed(2)}s · Snap 1 frame</small>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {clips.map((clip) => {
          const left = `${(clip.start / scale) * 100}%`;
          const width = `${Math.max(1, ((clip.end - clip.start) / scale) * 100)}%`;
          return (
            <div key={clip.id} data-clip={clip.id} data-track={clip.track} tabIndex={0} onClick={() => onSelect?.(clip.id)} onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') onMove?.(clip.id, -1 / 30);
              if (event.key === 'ArrowRight') onMove?.(clip.id, 1 / 30);
              if (event.key === 'Delete') onDelete(clip.id);
            }} style={{ position: 'relative', minHeight: 62, background: '#1e293b', borderRadius: 8, outline: selectedId === clip.id ? '2px solid #22d3ee' : undefined }}>
              <div style={{ position: 'absolute', left, width, top: 8, bottom: 8, minWidth: 80, background: '#0e7490', borderRadius: 6, padding: 8, boxSizing: 'border-box' }}>
                <strong>{clip.label}</strong>
                <small style={{ display: 'block' }}>{clip.start.toFixed(2)}s – {clip.end.toFixed(2)}s</small>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button data-testid={`trim-start-${clip.id}`} onClick={() => onTrim?.(clip.id, 'start', 1 / 30)}>Trim +</button>
                  <button data-testid={`trim-end-${clip.id}`} onClick={() => onTrim?.(clip.id, 'end', -1 / 30)}>Trim -</button>
                  <button data-testid={`split-${clip.id}`} onClick={() => onSplit(clip.id)}>Split</button>
                  <button data-testid={`delete-${clip.id}`} onClick={() => onDelete(clip.id)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {clips.length === 0 && <p>Chưa có clip trên timeline.</p>}
    </div>
  );
}
