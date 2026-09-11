import { useEffect, useMemo, useState } from 'react';
import type { MediaAsset, MediaKind } from '../../core/types.js';

interface Props {
  assets: MediaAsset[];
  onAdd: () => void;
  onDrop: (paths: string[]) => void;
  onInsert: (assetId: string) => void;
  onRemove: (assetId: string) => void;
}

const labels: Record<MediaKind, string> = { video: 'Video', audio: 'Âm thanh', image: 'Ảnh' };

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

function formatDuration(seconds: number, kind: MediaKind): string {
  if (kind === 'image') return '5 giây';
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function SourceBin({ assets, onAdd, onDrop, onInsert, onRemove }: Props): JSX.Element {
  const [tab, setTab] = useState<'all' | MediaKind>('all');
  const [query, setQuery] = useState('');
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    void Promise.all(assets.filter((asset) => asset.kind !== 'audio').map(async (asset) => [asset.id, await window.api.mediaUrl(asset.path)] as const)).then((entries) => {
      if (active) setMediaUrls(Object.fromEntries(entries));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [assets]);
  const filtered = useMemo(() => assets.filter((asset) => {
    const matchesTab = tab === 'all' || asset.kind === tab;
    return matchesTab && fileName(asset.path).toLowerCase().includes(query.trim().toLowerCase());
  }), [assets, query, tab]);

  const handleDrop = (event: React.DragEvent<HTMLElement>): void => {
    event.preventDefault();
    const paths = Array.from(event.dataTransfer.files).map((file) => window.api.droppedFilePath(file)).filter(Boolean);
    if (paths.length > 0) onDrop(paths);
  };

  return (
    <section className="source-bin" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <div className="panel-header"><h2>Kho nguồn</h2><button type="button" className="primary" onClick={onAdd}>＋ Thêm</button></div>
      <div className="source-tabs" role="tablist" aria-label="Kho nguồn">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>Nguồn</button>
        <button className={tab === 'audio' ? 'active' : ''} onClick={() => setTab('audio')}>Âm thanh</button>
        <button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')}>Ảnh</button>
        <button className={tab === 'video' ? 'active' : ''} onClick={() => setTab('video')}>Video</button>
      </div>
      <input aria-label="Tìm trong kho nguồn" placeholder="Tìm nguồn…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="source-drop-hint">Kéo video, âm thanh hoặc ảnh vào đây</div>
      <div className="source-list">
        {filtered.length === 0
          ? <div className="source-empty">Chưa có nguồn phù hợp.</div>
          : filtered.map((asset) => (
            <article className="source-row" key={asset.id}>
              {asset.kind === 'video' && mediaUrls[asset.id]
                ? <video className="source-thumb" src={mediaUrls[asset.id]} muted preload="metadata" />
                : asset.kind === 'image' && mediaUrls[asset.id]
                  ? <img className="source-thumb" src={mediaUrls[asset.id]} alt="" />
                  : <div className={`source-kind source-kind-${asset.kind}`}>{asset.kind === 'audio' ? '♫' : '▧'}</div>}
              <div className="source-info"><strong title={asset.path}>{fileName(asset.path)}</strong><small>{labels[asset.kind]} · {formatDuration(asset.durationSec, asset.kind)}</small></div>
              <div className="source-actions"><button type="button" title="Thêm nguồn vào timeline tại vị trí hiện tại" onClick={() => onInsert(asset.id)}>＋</button><button type="button" title="Xóa khỏi kho nguồn" onClick={() => onRemove(asset.id)}>×</button></div>
            </article>
          ))}
      </div>
    </section>
  );
}
