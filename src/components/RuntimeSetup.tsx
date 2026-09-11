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
  if (report?.ready) return null;
  if (!report) return <main className="setup-screen"><div className="setup-card"><h1>Đang kiểm tra thư viện</h1><p>Ứng dụng đang chuẩn bị không gian làm việc.</p><button onClick={onDownload} disabled={busy}>Kiểm tra lại</button></div></main>;
  const missing = report.assets.filter((asset) => !asset.ready);
  const requiredMissing = missing.filter((asset) => asset.required);
  const progressPercent = progress ? Math.round(progress.overallFraction * 100) : 0;
  return (
    <main className="setup-screen"><section className="setup-card">
      <div className="panel-header">
        <div>
          <h1>Cần cập nhật thư viện để bắt đầu</h1>
          <p className="panel-subtitle">Chỉ cần chuẩn bị một lần. Sau đó bạn có thể làm việc khi không có mạng.</p>
        </div>
        <span>{formatBytes(requiredMissing.reduce((sum, asset) => sum + asset.bytes, 0))}</span>
      </div>
      {!report.baseUrlConfigured && <p className="runtime-error">Không thể kết nối dịch vụ cập nhật. Vui lòng dùng bộ cài mới nhất.</p>}
      {progress && <div className="runtime-progress"><progress max={100} value={progressPercent} /><small>{progress.state === 'failed' ? 'Cập nhật chưa hoàn tất. Hãy kiểm tra kết nối và thử lại.' : `${progress.state === 'extracting' ? 'Đang hoàn tất' : 'Đang chuẩn bị ứng dụng'} · ${progressPercent}%`}</small></div>}
      <button className="primary" disabled={busy || !report.baseUrlConfigured} onClick={onDownload}>
        {busy ? 'Đang chuẩn bị ứng dụng…' : progress?.state === 'failed' ? 'Thử lại' : 'Cập nhật ngay'}
      </button>
    </section></main>
  );
}
