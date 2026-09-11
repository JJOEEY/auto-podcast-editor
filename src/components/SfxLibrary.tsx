import { useEffect, useState } from 'react';
import type { SfxAsset } from '../../core/sfxLibrary.js';

interface Props {
  onAdd: (asset: SfxAsset) => void;
}

export function SfxLibrary({ onAdd }: Props): JSX.Element {
  const [assets, setAssets] = useState<SfxAsset[]>([]);
  const [status, setStatus] = useState('');

  const refresh = async () => setAssets(await window.api.listSfx());
  useEffect(() => { void refresh(); }, []);

  const importAsset = async () => {
    const path = await window.api.openSfx();
    if (!path) return;
    try {
      const asset = await window.api.importSfx(path);
      setAssets((current) => current.some((x) => x.id === asset.id) ? current : [...current, asset]);
      setStatus(`Đã thêm ${asset.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="sfx-library">
      <div className="panel-header"><h2>Thư viện SFX</h2><button onClick={importAsset}>＋ Import</button></div>
      {status && <small>{status}</small>}
      <div className="sfx-list">{assets.map((asset) => (
        <div key={asset.id} className="sfx-row">
          <span>{asset.name} <small>({asset.category})</small></span>
          <button onClick={() => onAdd(asset)}>＋</button>
        </div>
      ))}</div>
      {assets.length === 0 && <p>Chưa có SFX. Import file WAV/MP3 để lưu vào thư viện.</p>}
    </section>
  );
}
