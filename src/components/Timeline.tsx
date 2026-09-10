import type { Clip } from '../../core/types.js';

interface Props {
  clips: Clip[];
  onSplit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Timeline({ clips, onSplit, onDelete }: Props): JSX.Element {
  return (
    <div data-timeline>
      {clips.map((c) => (
        <div key={c.id} data-clip={c.id} data-track={c.track}>
          <span>{c.label} ({c.start}s–{c.end}s)</span>
          <button data-testid={`split-${c.id}`} onClick={() => onSplit(c.id)}>Split</button>
          <button data-testid={`delete-${c.id}`} onClick={() => onDelete(c.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
