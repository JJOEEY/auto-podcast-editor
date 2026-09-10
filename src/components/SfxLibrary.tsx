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
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Thư viện SFX</h2>
        <button onClick={importAsset}>Import SFX</button>
      </div>
      {status && <small>{status}</small>}
      {assets.map((asset) => (
        <div key={asset.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
          <span>{asset.name} <small>({asset.category})</small></span>
          <button onClick={() => onAdd(asset)}>Thêm vào timeline</button>
        </div>
      ))}
      {assets.length === 0 && <p>Chưa có SFX. Import file WAV/MP3 để lưu vào thư viện.</p>}
    </section>
  );
}
