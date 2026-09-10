import { useEffect, useState } from 'react';
import type { CutProposal } from '../../core/types.js';

interface Props {
  proposals: CutProposal[];
  onApply: (selected: CutProposal[]) => void;
}

export function CutProposals({ proposals, onApply }: Props): JSX.Element {
  const [selected, setSelected] = useState<Set<string>>(new Set(proposals.map((p) => p.id)));

  useEffect(() => {
    setSelected(new Set(proposals.map((p) => p.id)));
  }, [proposals]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Đề xuất cắt ({proposals.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSelected(new Set(proposals.map((p) => p.id)))}>Chọn tất cả</button>
          <button onClick={() => setSelected(new Set())}>Bỏ chọn</button>
          <button onClick={() => onApply(proposals.filter((p) => selected.has(p.id)))} disabled={proposals.length === 0}>Áp dụng</button>
        </div>
      </div>
      {proposals.length === 0 ? <p>Chưa có đề xuất. Hãy chạy Transcribe.</p> : proposals.map((proposal) => (
        <label key={proposal.id} style={{ display: 'flex', gap: 8, padding: '6px 0' }}>
          <input type="checkbox" checked={selected.has(proposal.id)} onChange={() => toggle(proposal.id)} />
          <span>{proposal.reason} · {(proposal.end - proposal.start).toFixed(2)}s · {Math.round(proposal.confidence * 100)}%</span>
        </label>
      ))}
    </section>
  );
}
