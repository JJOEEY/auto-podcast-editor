import { useState } from 'react';
import { parseEditCommand, type EditCommand } from '../../core/commandParser.js';

interface Props {
  onApply: (commands: EditCommand[]) => void;
}

export function CommandPanel({ onApply }: Props): JSX.Element {
  const [text, setText] = useState('');
  const [commands, setCommands] = useState<EditCommand[]>([]);
  const run = () => setCommands(parseEditCommand(text));
  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 16 }}>
      <h2>AI Edit Commands</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') run(); }} placeholder="Remove long pauses, use karaoke captions..." style={{ flex: 1 }} />
        <button onClick={run}>Phân tích</button>
      </div>
      {commands.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {commands.map((command, index) => <div key={`${command.type}-${index}`}>{command.type} · {Math.round(command.confidence * 100)}%</div>)}
          <button onClick={() => onApply(commands)} style={{ marginTop: 8 }}>Áp dụng</button>
        </div>
      )}
      {text && commands.length === 0 && <small>Chưa nhận diện được lệnh an toàn.</small>}
    </section>
  );
}
