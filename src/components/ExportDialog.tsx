import { useEffect, useMemo, useState } from 'react';
import { buildHashtags } from '../../core/hashtags.js';
import { estimateBytes, validateExportRequest, type ExportFormat, type ExportQuality, type ExportRequest } from '../../core/export.js';
import type { Project } from '../../core/types.js';

interface Props {
  project: Project;
  onClose: () => void;
  onExport: (request: ExportRequest) => Promise<void>;
}

const builtIns: Record<string, Partial<ExportRequest>> = {
  'TikTok 4K': { format: 'mp4-h264', quality: '4k', target: 'video-audio', captions: 'both' },
  'Nháp 720p nhanh': { format: 'mp4-h264', quality: '720p', target: 'video-audio', captions: 'srt' },
  'Lưu trữ ProRes': { format: 'mov-prores', quality: '1080p', target: 'video-audio', captions: 'both' },
  'Audio MP3': { format: 'mp3', quality: '1080p', target: 'audio', captions: 'srt' },
};

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

export function ExportDialog({ project, onClose, onExport }: Props): JSX.Element {
  const [fileName, setFileName] = useState(`${project.name}_${project.preset}`);
  const [dir, setDir] = useState(() => localStorage.getItem('ape.exportDir') || '');
  const [format, setFormat] = useState<ExportFormat>('mp4-h264');
  const [quality, setQuality] = useState<ExportQuality>('1080p');
  const [bitrateMode, setBitrateMode] = useState<'auto' | 'custom'>('auto');
  const [customMbps, setCustomMbps] = useState(12);
  const [target, setTarget] = useState<ExportRequest['target']>('video-audio');
  const [captions, setCaptions] = useState<ExportRequest['captions']>('both');
  const [range, setRange] = useState<ExportRequest['range']>('all');
  const [thumbSec, setThumbSec] = useState(1);
  const [hashtags, setHashtags] = useState(buildHashtags(project.name));
  const [voicePreset, setVoicePreset] = useState<NonNullable<ExportRequest['voicePreset']>>('podcast');
  const [presetName, setPresetName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHashtags(buildHashtags(project.name));
  }, [project.name]);

  const request = useMemo<ExportRequest>(() => ({
    fileName, dir, format, quality, bitrateMode, customMbps, target, captions, range, thumbSec, hashtags, voicePreset,
  }), [fileName, dir, format, quality, bitrateMode, customMbps, target, captions, range, thumbSec, hashtags, voicePreset]);

  const estimated = estimateBytes(request, project.durationSec);

  const chooseDir = async () => {
    const selected = await window.api.openDirectory();
    if (selected) {
      setDir(selected);
      localStorage.setItem('ape.exportDir', selected);
    }
  };

  const selectPreset = (name: string) => {
    const preset = builtIns[name];
    if (preset) {
      if (preset.format) setFormat(preset.format);
      if (preset.quality) setQuality(preset.quality);
      if (preset.target) setTarget(preset.target);
      if (preset.captions) setCaptions(preset.captions);
    }
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const current = JSON.parse(localStorage.getItem('ape.exportPresets') || '{}') as Record<string, ExportRequest>;
    current[presetName.trim()] = request;
    localStorage.setItem('ape.exportPresets', JSON.stringify(current));
    setPresetName('');
  };

  const submit = async () => {
    setError('');
    try {
      validateExportRequest(request);
      setSaving(true);
      await onExport(request);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.7)', zIndex: 10, padding: 32, overflow: 'auto' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', background: '#fff', borderRadius: 14, padding: 24 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginTop: 0 }}>Xuất video</h2>
          <button onClick={onClose}>Đóng</button>
        </header>

        <label>Tên file<input value={fileName} onChange={(e) => setFileName(e.target.value)} style={{ display: 'block', width: '100%' }} /></label>
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 16px' }}>
          <input value={dir} readOnly placeholder="Chọn thư mục lưu" style={{ flex: 1 }} />
          <button onClick={chooseDir}>Đổi thư mục</button>
        </div>

        <label>Preset nhanh<select onChange={(e) => selectPreset(e.target.value)} defaultValue="">
          <option value="" disabled>Chọn preset</option>
          {Object.keys(builtIns).map((name) => <option key={name}>{name}</option>)}
        </select></label>

        <fieldset><legend>Định dạng</legend>
          {(['mp4-h264', 'mp4-hevc', 'webm-vp9', 'mov-prores', 'mp3', 'wav'] as ExportFormat[]).map((item) => (
            <label key={item} style={{ marginRight: 12 }}><input type="radio" checked={format === item} onChange={() => setFormat(item)} />{item}</label>
          ))}
        </fieldset>

        <fieldset disabled={target === 'audio'}><legend>Chất lượng</legend>
          {(['720p', '1080p', '2k', '4k'] as ExportQuality[]).map((item) => (
            <label key={item} style={{ marginRight: 12 }}><input type="radio" checked={quality === item} onChange={() => setQuality(item)} />{item}</label>
          ))}
        </fieldset>

        <label>Bitrate
          <select value={bitrateMode} onChange={(e) => setBitrateMode(e.target.value as 'auto' | 'custom')}>
            <option value="auto">Auto</option><option value="custom">Custom</option>
          </select>
          {bitrateMode === 'custom' && <input type="number" min="1" max="50" value={customMbps} onChange={(e) => setCustomMbps(Number(e.target.value))} />}
        </label>
        <p>Ước lượng: <strong>{formatSize(estimated)}</strong>{estimated > 2_000_000_000 && ' · File lớn hơn 2GB'}</p>

        <fieldset><legend>Xuất</legend>
          {(['video-audio', 'audio', 'video-mute'] as ExportRequest['target'][]).map((item) => <label key={item} style={{ marginRight: 12 }}><input type="radio" checked={target === item} onChange={() => setTarget(item)} />{item}</label>)}
        </fieldset>
        <fieldset disabled={target === 'audio'}><legend>Subtitle</legend>
          {(['burn', 'srt', 'both'] as ExportRequest['captions'][]).map((item) => <label key={item} style={{ marginRight: 12 }}><input type="radio" checked={captions === item} onChange={() => setCaptions(item)} />{item}</label>)}
        </fieldset>
        <label>Voice enhance
          <select value={voicePreset} onChange={(e) => setVoicePreset(e.target.value as NonNullable<ExportRequest['voicePreset']>)}>
            <option value="podcast">Podcast</option><option value="clean">Clean</option><option value="broadcast">Broadcast</option><option value="warm">Warm</option><option value="none">Tắt</option>
          </select>
        </label>
        <label>Thumbnail tại giây <input type="number" min="0" step="0.1" value={thumbSec} onChange={(e) => setThumbSec(Number(e.target.value))} /></label>
        <label>Hashtag (4 tag, cách nhau bằng dấu phẩy)<input value={hashtags.join(', ')} onChange={(e) => setHashtags(e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4) as ExportRequest['hashtags'])} style={{ display: 'block', width: '100%' }} /></label>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input placeholder="Tên preset mới" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button onClick={savePreset}>Lưu preset</button>
          <button onClick={submit} disabled={saving}>{saving ? 'Đang xuất...' : 'Xuất'}</button>
        </div>
        {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      </div>
    </div>
  );
}
