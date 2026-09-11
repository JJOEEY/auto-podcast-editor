import { useState } from 'react';
import { parseEditCommand, type EditCommand } from '../../core/commandParser.js';
import type { DryRunResult } from '../../core/commands.js';

interface Props {
  onPreview: (commands: EditCommand[]) => void;
  onApply: () => void;
  preview: DryRunResult | null;
  onAiPreview?: (text: string) => void;
  aiBusy?: boolean;
}

export function CommandPanel({ onPreview, onApply, preview, onAiPreview, aiBusy = false }: Props): JSX.Element {
  const [text, setText] = useState('');
  const [commands, setCommands] = useState<EditCommand[]>([]);
  const run = () => {
    const parsed = parseEditCommand(text);
    setCommands(parsed);
    onPreview(parsed);
  };
  return (
    <section className="command-panel">
      <div className="panel-header"><h2>Trợ lý chỉnh sửa</h2><span className="badge">AI</span></div>
      <div className="command-row">
        <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') run(); }} placeholder="Ví dụ: bỏ khoảng lặng dài…" />
        <div className="command-actions">
          <button onClick={run}>Phân tích</button>
          {onAiPreview && <button className="primary" onClick={() => onAiPreview(text)} disabled={!text.trim() || aiBusy}>{aiBusy ? 'Đang chạy…' : 'AI local'}</button>}
        </div>
      </div>
      {commands.length > 0 && (
        <div className="command-list">
          {commands.map((command, index) => <div className="command-item" key={`${command.type}-${index}`}>{command.type} <small>· {Math.round(command.confidence * 100)}%</small></div>)}
          <button className="primary" onClick={onApply} disabled={!preview || !preview.ok}>Xem trước & áp dụng</button>
        </div>
      )}
      {text && commands.length === 0 && <small>Chưa nhận diện được lệnh an toàn.</small>}
      {preview && (
        <div className={`dry-run ${preview.ok ? 'ok' : 'error'}`}>
          <strong>{preview.ok ? 'Dry-run hợp lệ' : 'Dry-run bị chặn'}</strong>
          {preview.diff.changedItemIds.length > 0 && <div>Item thay đổi: {preview.diff.changedItemIds.length}</div>}
          {preview.diff.removedItemIds.length > 0 && <div>Item bị xóa: {preview.diff.removedItemIds.length}</div>}
          {preview.diff.changedFields.length > 0 && <div>Trường thay đổi: {preview.diff.changedFields.join(', ')}</div>}
          {preview.warnings.map((warning) => <div key={warning} style={{ color: '#92400e' }}>Cảnh báo: {warning}</div>)}
          {preview.errors.map((error) => <div key={error} style={{ color: '#b91c1c' }}>Lỗi: {error}</div>)}
        </div>
      )}
    </section>
  );
}
