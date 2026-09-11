import { useRef, useState } from 'react';
import type { Clip, Track } from '../../core/types.js';
import type { WaveformCache } from '../../core/waveform.js';
import { WaveformView } from './WaveformView.js';

interface Props {
  clips: Clip[];
  durationSec?: number;
  selectedId?: string | null;
  selectedIds?: string[];
  onSelect?: (id: string) => void;
  onSelectMany?: (ids: string[]) => void;
  onMove?: (id: string, delta: number) => void;
  onMoveMany?: (ids: string[], delta: number) => void;
  onTrim?: (id: string, edge: 'start' | 'end', delta: number) => void;
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  onRippleDelete?: (id: string) => void;
  onTrackChange?: (id: string, track: Clip['track']) => void;
  onTrackMuted?: (id: string, muted: boolean) => void;
  onTrackLocked?: (id: string, locked: boolean) => void;
  onTrackHidden?: (id: string, hidden: boolean) => void;
  waveform?: WaveformCache | null;
  tracks?: Track[];
}

export function Timeline({ clips, durationSec = 1, selectedId, selectedIds, onSelect, onSelectMany, onMove, onMoveMany, onTrim, onSplit, onDelete, onDeleteMany, onRippleDelete, onTrackChange, onTrackMuted, onTrackLocked, onTrackHidden, waveform, tracks }: Props): JSX.Element {
  const scale = Math.max(1, durationSec);
  const timelineRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; lastDelta: number } | null>(null);
  const trimRef = useRef<{ id: string; edge: 'start' | 'end'; startX: number; lastDelta: number } | null>(null);
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(selectedId ? [selectedId] : []);
  const activeSelectedIds = selectedIds ?? internalSelectedIds;
  const setSelection = (ids: string[]) => {
    if (!selectedIds) setInternalSelectedIds(ids);
    onSelectMany?.(ids);
    if (ids[0]) onSelect?.(ids[0]);
  };
  const selectClip = (event: React.MouseEvent, id: string) => {
    const next = event.shiftKey
      ? activeSelectedIds.includes(id) ? activeSelectedIds.filter((item) => item !== id) : [...activeSelectedIds, id]
      : [id];
    setSelection(next);
  };
  const beginDrag = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (!onMove) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id, startX: event.clientX, lastDelta: 0 };
    if (!activeSelectedIds.includes(id)) setSelection([id]);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const bounds = timelineRef.current?.getBoundingClientRect();
    if (!drag || !bounds || bounds.width <= 0 || !onMove) return;
    const seconds = ((event.clientX - drag.startX) / bounds.width) * scale;
    const clip = clips.find((item) => item.id === drag.id);
    if (!clip) return;
    const frameSnapped = Math.round(seconds * 30) / 30;
    const guides = [0, scale, ...clips.filter((item) => item.id !== drag.id).flatMap((item) => [item.start, item.end])];
    const candidate = clip.start + frameSnapped;
    const nearest = guides.reduce<{ value: number; distance: number } | null>((best, guide) => {
      const distance = Math.abs(guide - candidate);
      return !best || distance < best.distance ? { value: guide, distance } : best;
    }, null);
    const snapped = nearest && nearest.distance <= 2 / 30 ? nearest.value - clip.start : frameSnapped;
    const delta = snapped - drag.lastDelta;
    if (delta !== 0) {
      const ids = activeSelectedIds.includes(drag.id) ? activeSelectedIds : [drag.id];
      if (onMoveMany && ids.length > 1) onMoveMany(ids, delta);
      else onMove?.(drag.id, delta);
      drag.lastDelta = snapped;
    }
  };
  const endDrag = () => {
    dragRef.current = null;
  };
  const beginTrim = (event: React.PointerEvent<HTMLDivElement>, id: string, edge: 'start' | 'end') => {
    if (!onTrim) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    trimRef.current = { id, edge, startX: event.clientX, lastDelta: 0 };
  };
  const moveTrim = (event: React.PointerEvent<HTMLDivElement>) => {
    const trim = trimRef.current;
    const bounds = timelineRef.current?.getBoundingClientRect();
    if (!trim || !bounds || bounds.width <= 0 || !onTrim) return;
    const seconds = ((event.clientX - trim.startX) / bounds.width) * scale;
    const snapped = Math.round(seconds * 30) / 30;
    const delta = snapped - trim.lastDelta;
    if (delta !== 0) {
      onTrim(trim.id, trim.edge, delta);
      trim.lastDelta = snapped;
    }
  };
  const endTrim = () => { trimRef.current = null; };
  const trackList: Track[] = tracks?.length
    ? tracks
    : [...new Set(clips.map((clip) => clip.track))].map((id, index) => ({ id, kind: id === 'CC' ? 'caption' : id.startsWith('A') ? 'audio' : 'video', name: id, index }));
  return (
    <div ref={timelineRef} data-timeline style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 16, background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>Timeline</strong>
        <small>{durationSec.toFixed(2)}s · Snap 1 frame</small>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {waveform && <WaveformView waveform={waveform} />}
        {trackList.map((track) => {
          const trackClips = clips.filter((clip) => clip.track === track.id);
          return (
            <div key={track.id} data-track-row={track.id} style={{ display: 'flex', minHeight: 78, background: track.hidden ? '#111827' : '#1e293b', borderRadius: 8, opacity: track.muted ? 0.55 : 1 }}>
              <div style={{ width: 150, padding: 10, boxSizing: 'border-box', borderRight: '1px solid #334155' }}>
                <strong>{track.name}</strong>
                <small style={{ display: 'block' }}>{track.locked ? 'Khóa' : track.muted ? 'Mute' : track.hidden ? 'Ẩn' : track.kind}</small>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {onTrackMuted && <button type="button" data-testid={`mute-track-${track.id}`} onClick={() => onTrackMuted(track.id, !track.muted)}>{track.muted ? 'Unmute' : 'Mute'}</button>}
                  {onTrackLocked && <button type="button" data-testid={`lock-track-${track.id}`} onClick={() => onTrackLocked(track.id, !track.locked)}>{track.locked ? 'Mở khóa' : 'Khóa'}</button>}
                  {onTrackHidden && <button type="button" data-testid={`hide-track-${track.id}`} onClick={() => onTrackHidden(track.id, !track.hidden)}>{track.hidden ? 'Show' : 'Hide'}</button>}
                </div>
              </div>
              <div style={{ position: 'relative', flex: 1, minHeight: 78 }}>
                {trackClips.map((clip) => {
                  const left = `${(clip.start / scale) * 100}%`;
                  const width = `${Math.max(1, ((clip.end - clip.start) / scale) * 100)}%`;
                  const editable = !track.locked && !track.hidden;
                  return (
                    <div key={clip.id} data-clip={clip.id} data-track={clip.track} tabIndex={0} onClick={(event) => selectClip(event, clip.id)} onKeyDown={(event) => {
                      if (!editable) return;
                      if (event.key === 'ArrowLeft') onMoveMany?.(activeSelectedIds.includes(clip.id) ? activeSelectedIds : [clip.id], -1 / 30);
                      if (event.key === 'ArrowRight') onMoveMany?.(activeSelectedIds.includes(clip.id) ? activeSelectedIds : [clip.id], 1 / 30);
                      if (event.key === 'Delete') {
                        const ids = activeSelectedIds.includes(clip.id) ? activeSelectedIds : [clip.id];
                        if (onDeleteMany) onDeleteMany(ids);
                        else onDelete(clip.id);
                      }
                    }} style={{ position: 'absolute', left, width, top: 8, bottom: 8, minWidth: 80, background: '#0e7490', borderRadius: 6, padding: 8, boxSizing: 'border-box', outline: activeSelectedIds.includes(clip.id) ? '2px solid #22d3ee' : undefined }}>
                      <div
                        data-testid={`trim-handle-start-${clip.id}`}
                        onPointerDown={(event) => editable && beginTrim(event, clip.id, 'start')}
                        onPointerMove={moveTrim}
                        onPointerUp={endTrim}
                        onPointerCancel={endTrim}
                        title="Kéo để trim đầu clip"
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, cursor: editable ? 'ew-resize' : 'default', background: 'rgba(255,255,255,.32)', borderRadius: '6px 0 0 6px', touchAction: 'none' }}
                      />
                      <div
                        data-testid={`trim-handle-end-${clip.id}`}
                        onPointerDown={(event) => editable && beginTrim(event, clip.id, 'end')}
                        onPointerMove={moveTrim}
                        onPointerUp={endTrim}
                        onPointerCancel={endTrim}
                        title="Kéo để trim cuối clip"
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 10, cursor: editable ? 'ew-resize' : 'default', background: 'rgba(255,255,255,.32)', borderRadius: '0 6px 6px 0', touchAction: 'none' }}
                      />
                      <div
                        onPointerDown={(event) => editable && beginDrag(event, clip.id)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        title="Kéo để di chuyển clip · giữ phím mũi tên để nudge từng frame"
                        style={{ cursor: editable && onMove ? 'grab' : 'default', touchAction: 'none' }}
                      >
                        <strong>{clip.label}</strong>
                        <small style={{ display: 'block' }}>{clip.start.toFixed(2)}s – {clip.end.toFixed(2)}s</small>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button disabled={!editable} data-testid={`trim-start-${clip.id}`} onClick={() => onTrim?.(clip.id, 'start', 1 / 30)}>Trim +</button>
                        <button disabled={!editable} data-testid={`trim-end-${clip.id}`} onClick={() => onTrim?.(clip.id, 'end', -1 / 30)}>Trim -</button>
                        <button disabled={!editable} data-testid={`split-${clip.id}`} onClick={() => onSplit(clip.id)}>Split</button>
                        <button disabled={!editable} data-testid={`delete-${clip.id}`} onClick={() => onDelete(clip.id)}>Delete</button>
                        {onRippleDelete && <button disabled={!editable} data-testid={`ripple-${clip.id}`} onClick={() => onRippleDelete(clip.id)}>Ripple</button>}
                        {onTrackChange && <select aria-label={`Track ${clip.id}`} disabled={!editable} value={clip.track} onChange={(event) => onTrackChange(clip.id, event.target.value as Clip['track'])}>{trackList.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {clips.length === 0 && <p>Chưa có clip trên timeline.</p>}
    </div>
  );
}
