import type { RuntimeAssetProgress } from '../../electron/runtimeAssets.js';

interface RuntimeAssetState {
  id: string;
  label: string;
  bytes: number;
  required: boolean;
  ready: boolean;
  error?: string;
}

interface RuntimeReport {
  root: string;
  baseUrlConfigured: boolean;
  ready: boolean;
  assets: RuntimeAssetState[];
}

interface RuntimeSetupProps {
  report: RuntimeReport | null;
  progress: RuntimeAssetProgress | null;
  busy: boolean;
  onDownload: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

export function RuntimeSetup({ report, progress, busy, onDownload }: RuntimeSetupProps): JSX.Element | null {
  if (!report || report.ready) return null;
  const missing = report.assets.filter((asset) => !asset.ready);
  const requiredMissing = missing.filter((asset) => asset.required);
  const progressPercent = progress ? Math.round(progress.overallFraction * 100) : 0;
  return (
    <section className="runtime-setup panel-card">
      <div className="panel-header">
        <div>
          <h2>Thiết lập lần đầu</h2>
          <p className="panel-subtitle">Tải thành phần cần thiết sau khi cài app</p>
        </div>
        <span className="badge badge-warn">{requiredMissing.length} còn thiếu</span>
      </div>
      <div className="runtime-asset-list">
        {missing.map((asset) => (
          <div className="runtime-asset-row" key={asset.id}>
            <span>{asset.label}</span>
            <small>{formatBytes(asset.bytes)}{asset.required ? ' · bắt buộc' : ' · tuỳ chọn'}</small>
          </div>
        ))}
      </div>
      {!report.baseUrlConfigured && <p className="runtime-error">Chưa cấu hình nguồn tải runtime cho bản phát hành này.</p>}
      {progress && <div className="runtime-progress"><span style={{ width: `${progressPercent}%` }} /><small>{progress.label} · {progress.state === 'failed' ? progress.error : `${progressPercent}%`}</small></div>}
      <button className="primary" disabled={busy || !report.baseUrlConfigured} onClick={onDownload}>
        {busy ? 'Đang tải thành phần…' : 'Tải toàn bộ runtime'}
      </button>
    </section>
  );
}
