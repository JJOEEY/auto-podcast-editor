import { useEffect, useReducer, useState } from 'react';
import { buildKeepClips, complementRanges, filterCaptionsToKeeps } from '../core/keepRanges.js';
import { chunkCaption } from '../core/caption.js';
import { proposeCuts } from '../core/cutDetection.js';
import { createDefaultSettings } from '../core/defaults.js';
import type { ExportRequest } from '../core/export.js';
import type { Word } from '../core/types.js';
import { createState, reduce } from './state/reducer.js';
import { Timeline } from './components/Timeline.js';
import { Preview } from './components/Preview.js';
import { CutProposals } from './components/CutProposals.js';
import { ExportDialog } from './components/ExportDialog.js';
import { SfxLibrary } from './components/SfxLibrary.js';
import { makeSfxClip } from '../core/sfxLibrary.js';
import { decorateTransitions, TRANSITION_PRESETS, transitionConfig } from '../core/effects.js';

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(
    reduce,
    createState({ name: 'untitled', sourcePath: '', durationSec: 0, preset: 'vertical', settings: createDefaultSettings() }),
  );
  const [modelPath, setModelPath] = useState('');
  const [status, setStatus] = useState('Chưa có video');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [transitionType, setTransitionType] = useState<'hard-cut' | 'fade' | 'glitch' | 'film-burn'>('fade');

  useEffect(() => window.api.onProgress((event) => {
    if (event.name === 'transcribe') setProgress(Math.round(event.fraction * 100));
  }), []);

  const importVideo = async (): Promise<void> => {
    try {
      const filePath = await window.api.openVideo();
      if (!filePath) return;
      setStatus('Đang đọc video...');
      const durationSec = await window.api.probe(filePath);
      const name = filePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'untitled';
      dispatch({
        type: 'open-project',
        project: {
          version: 1,
          name,
          sourcePath: filePath,
          durationSec,
          clips: [{ id: 'source-1', track: 'V1', start: 0, end: durationSec, label: 'source' }],
          proposals: [],
          captions: [],
          preset: 'vertical',
          settings: createDefaultSettings(),
          sfx: [],
          subtitleStyle: 'karaoke',
        },
      });
      setStatus(`Đã import: ${name} (${durationSec.toFixed(1)}s)`);
    } catch (error) {
      setStatus(`Import lỗi: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const chooseModel = async (): Promise<void> => {
    const selected = await window.api.openModel();
    if (selected) {
      setModelPath(selected);
      setStatus(`Đã chọn model: ${selected.split(/[\\/]/).pop()}`);
    }
  };

  const transcribe = async (): Promise<void> => {
    if (!state.present.sourcePath) {
      setStatus('Hãy import video trước.');
      return;
    }
    let selectedModel = modelPath;
    if (!selectedModel) {
      selectedModel = (await window.api.openModel()) || '';
      if (!selectedModel) return;
      setModelPath(selectedModel);
    }
    setBusy(true);
    setProgress(0);
    setStatus('Đang phân tích giọng nói...');
    try {
      await window.api.reset();
    } catch {
      // A prior job can still be winding down after cancellation; the queue reports it.
    }
    try {
      const result = await window.api.transcribe(state.present.sourcePath, selectedModel);
      const words: Word[] = result.words;
      const proposals = proposeCuts(words, [], state.present.settings);
      const captionWords = words.filter((word) => !proposals.some((p) =>
        p.kind === 'filler' && word.start >= p.start && word.end <= p.end,
      ));
      const captions = chunkCaption(captionWords);
      const keeps = complementRanges(proposals, state.present.durationSec);
      dispatch({
        type: 'apply-analysis',
        clips: decorateTransitions(buildKeepClips(proposals, state.present.durationSec), proposals),
        captions: filterCaptionsToKeeps(captions, keeps),
        proposals,
      });
      setProgress(100);
      setStatus(`Phân tích xong: ${proposals.length} đề xuất cắt, ${captions.length} caption.`);
    } catch (error) {
      setStatus(`Phân tích lỗi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (): Promise<void> => {
    await window.api.cancel();
    setStatus('Đang hủy tác vụ...');
  };

  const exportProject = async (request: ExportRequest): Promise<void> => {
    setBusy(true);
    setStatus('Đang render và xuất file...');
    try {
      await window.api.reset();
    } catch {
      // A previous cancelled job is still draining; the queue will surface the error.
    }
    try {
      await window.api.render(state.present, request);
      setStatus('Xuất video thành công.');
    } catch (error) {
      setStatus(`Xuất lỗi: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const applySelectedProposals = (selected: typeof state.present.proposals): void => {
    const keeps = complementRanges(selected, state.present.durationSec);
    dispatch({
      type: 'apply-analysis',
      clips: buildKeepClips(selected, state.present.durationSec),
      captions: filterCaptionsToKeeps(state.present.captions, keeps),
      proposals: selected,
    });
    setStatus(`Đã áp dụng ${selected.length} đề xuất cắt.`);
  };

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Auto Podcast Editor</h1>
          <p style={{ color: '#64748b', marginTop: 6 }}>{status}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={importVideo} disabled={busy}>Import video</button>
          <button onClick={chooseModel} disabled={busy}>{modelPath ? 'Đổi model' : 'Chọn Whisper model'}</button>
          <button onClick={transcribe} disabled={busy || !state.present.sourcePath}>Transcribe + auto-cut</button>
          <button onClick={() => setExportOpen(true)} disabled={busy || !state.present.sourcePath}>Xuất</button>
          {busy && <button onClick={cancel}>Cancel</button>}
          <select value={state.present.preset} onChange={(event) => dispatch({ type: 'set-preset', preset: event.target.value as 'vertical' | 'horizontal' })}>
            <option value="vertical">Dọc 9:16</option>
            <option value="horizontal">Ngang 16:9</option>
          </select>
        </div>
      </header>
      {busy && (
        <div style={{ margin: '16px 0' }}>
          <progress max={100} value={progress} style={{ width: '100%' }} />
          <small>{progress}% — đang chạy nền, bạn có thể hủy</small>
        </div>
      )}
      <section style={{ marginTop: 24 }}>
        <Preview sourcePath={state.present.sourcePath} clips={state.present.clips} captions={state.present.captions} sfx={state.present.sfx} subtitleStyle={state.present.subtitleStyle} preset={state.present.preset} />
      </section>
      <section style={{ marginTop: 24 }}>
        <CutProposals proposals={state.present.proposals} onApply={applySelectedProposals} />
      </section>
      <section style={{ marginTop: 24 }}>
        <SfxLibrary onAdd={(asset) => dispatch({ type: 'add-sfx', clip: makeSfxClip(asset, 0) })} />
      </section>
      <section style={{ marginTop: 24 }}>
        <h2>Transition</h2>
        <select value={transitionType} onChange={(event) => setTransitionType(event.target.value as typeof transitionType)}>
          {TRANSITION_PRESETS.filter((preset) => preset.id !== 'hard-cut').map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
        <button onClick={() => dispatch({ type: 'set-transition-all', transition: transitionConfig(transitionType) })} disabled={state.present.clips.length < 2}>Áp dụng cho các cut</button>
      </section>
      <section style={{ marginTop: 24 }}>
        <Timeline
          clips={state.present.clips}
          onSplit={(id) => {
            const clip = state.present.clips.find((c) => c.id === id);
            if (clip) dispatch({ type: 'split-clip', id, at: clip.start + 1 });
          }}
          onDelete={(id) => dispatch({ type: 'delete-clip', id })}
        />
      </section>
      <footer style={{ marginTop: 16, color: '#64748b' }}>
        {state.present.clips.length} video clip · {state.present.captions.length} caption · {state.present.proposals.length} đề xuất
      </footer>
      {exportOpen && <ExportDialog project={state.present} onClose={() => setExportOpen(false)} onExport={exportProject} />}
    </div>
  );
}
