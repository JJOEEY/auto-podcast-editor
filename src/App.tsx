import { useEffect, useReducer, useRef, useState } from 'react';
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
import { CommandPanel } from './components/CommandPanel.js';
import type { EditCommand } from '../core/commandParser.js';
import { toEditorCommands } from '../core/commandAdapter.js';
import { applyEditorCommands, simulateEditorCommands, type DryRunResult } from '../core/commands.js';
import type { EditorCommand } from '../core/types.js';
import type { WaveformCache } from '../core/waveform.js';
import { SfxLibrary } from './components/SfxLibrary.js';
import { makeSfxClip } from '../core/sfxLibrary.js';
import { decorateTransitions, TRANSITION_PRESETS, transitionConfig } from '../core/effects.js';
import { AudioMixer } from './components/AudioMixer.js';
import { SfxEditor } from './components/SfxEditor.js';
import { RuntimeSetup } from './components/RuntimeSetup.js';
import { SourceBin } from './components/SourceBin.js';

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
  const [projectFilePath, setProjectFilePath] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<Record<string, { name: string; ok: boolean; path?: string | null; error?: string | null; vramBytes?: number | null; llmMode?: 'gpu' | 'cpu' | 'rule-based' }> | null>(null);
  const [transitionType, setTransitionType] = useState<'hard-cut' | 'fade' | 'glitch' | 'film-burn'>('fade');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [commandPreview, setCommandPreview] = useState<DryRunResult | null>(null);
  const [pendingEditorCommands, setPendingEditorCommands] = useState<EditorCommand[]>([]);
  const [commandPreviewRevision, setCommandPreviewRevision] = useState<number | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [waveform, setWaveform] = useState<WaveformCache | null>(null);
  const [runtimeReport, setRuntimeReport] = useState<Awaited<ReturnType<typeof window.api.runtimeAssets>> | null>(null);
  const [runtimeProgress, setRuntimeProgress] = useState<import('../electron/runtimeAssets.js').RuntimeAssetProgress | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const commandRun = useRef(0);

  useEffect(() => window.api.onProgress((event) => {
    if (event.name === 'transcribe') setProgress(Math.round(event.fraction * 100));
  }), []);

  useEffect(() => {
    if (!projectFilePath || !state.present.sourcePath) return;
    const timer = window.setTimeout(() => {
      void window.api.writeProject(projectFilePath, state.present).catch((error) => {
        setStatus(`Autosave lỗi: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [projectFilePath, state.present]);

  useEffect(() => {
    void window.api.doctor().then(setDoctor).catch(() => setDoctor(null));
    void window.api.runtimeAssets().then(setRuntimeReport).catch(() => setRuntimeReport(null));
    return window.api.onRuntimeAssetProgress(setRuntimeProgress);
  }, []);

  useEffect(() => {
    let active = true;
    void window.api.captureMode().then((enabled) => enabled ? window.api.captureProject() : null).then((project) => {
      if (!active || !project) return;
      dispatch({ type: 'open-project', project });
      setProjectFilePath(null);
      setStatus('Player golden capture mode');
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!state.present.sourcePath) {
      setWaveform(null);
      return;
    }
    let active = true;
    setWaveform(null);
    void window.api.waveform(state.present.sourcePath).then((cache) => {
      if (active) setWaveform(cache);
    }).catch(() => {
      if (active) setWaveform(null);
    });
    return () => { active = false; };
  }, [state.present.sourcePath]);

  useEffect(() => {
    if (!projectFilePath || !state.present.sourcePath) return;
    const interval = window.setInterval(() => {
      void window.api.writeProject(projectFilePath, state.present);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [projectFilePath, state.present]);

  const importMedia = async (droppedPaths?: string[]): Promise<void> => {
    try {
      const paths = droppedPaths ?? await window.api.openMedia();
      if (paths.length === 0) return;
      setStatus(`Đang đọc ${paths.length} nguồn…`);
      const imported = [];
      const failed: string[] = [];
      for (const path of paths) {
        try {
          imported.push(await window.api.inspectMedia(path));
        } catch {
          failed.push(path.split(/[\\/]/).pop() ?? path);
        }
      }
      if (imported.length > 0) dispatch({ type: 'import-assets', assets: imported });
      if (failed.length > 0) setStatus(`Đã thêm ${imported.length} nguồn; không đọc được ${failed.length} file.`);
      else setStatus(`Đã thêm ${imported.length} nguồn vào kho.`);
    } catch (error) {
      setStatus(`Import lỗi: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openProject = async (): Promise<void> => {
    const filePath = await window.api.openProject();
    if (!filePath) return;
    try {
      const project = await window.api.loadProject(filePath);
      dispatch({ type: 'open-project', project });
      setProjectFilePath(filePath);
      setModelPath('');
      setStatus(`Đã mở project: ${project.name}`);
    } catch (error) {
      setStatus(`Mở project lỗi: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const saveProject = async (): Promise<void> => {
    try {
      const filePath = projectFilePath || await window.api.saveProject(state.present.name);
      if (!filePath) return;
      await window.api.writeProject(filePath, state.present);
      setProjectFilePath(filePath);
      setStatus(`Đã lưu: ${filePath.split(/[\\/]/).pop()}`);
    } catch (error) {
      setStatus(`Lưu project lỗi: ${error instanceof Error ? error.message : String(error)}`);
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
    let selectedModel = modelPath || (await window.api.defaultModel()) || '';
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

  const downloadRuntime = async (): Promise<void> => {
    setRuntimeBusy(true);
    setRuntimeProgress(null);
    setStatus('Đang tải runtime sau cài đặt...');
    try {
      const next = await window.api.downloadRuntime();
      setRuntimeReport(next);
      const nextDoctor = await window.api.doctor();
      setDoctor(nextDoctor);
      setStatus(next.ready ? 'Đã tải xong runtime.' : 'Runtime vẫn còn thành phần thiếu.');
    } catch (error) {
      setStatus(`Tải runtime lỗi: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRuntimeBusy(false);
    }
  };

  const previewCommands = (commands: EditCommand[]): void => {
    const editorCommands = toEditorCommands(commands, state.present, `ai-${commandRun.current += 1}`);
    setPendingEditorCommands(editorCommands);
    setCommandPreview(simulateEditorCommands(state.present, editorCommands));
    setCommandPreviewRevision(state.present.revision ?? 0);
  };

  const applyCommands = (): void => {
    if (!commandPreview || pendingEditorCommands.length === 0 || commandPreviewRevision !== (state.present.revision ?? 0)) {
      setCommandPreview(null);
      setPendingEditorCommands([]);
      setCommandPreviewRevision(null);
      setStatus('Project đã thay đổi; cần phân tích lệnh lại trước khi áp dụng.');
      return;
    }
    const latestDryRun = simulateEditorCommands(state.present, pendingEditorCommands);
    if (!latestDryRun.ok) {
      setCommandPreview(latestDryRun);
      setCommandPreviewRevision(null);
      setStatus('Project đã thay đổi; cần phân tích lệnh lại trước khi áp dụng.');
      return;
    }
    const next = applyEditorCommands(state.present, pendingEditorCommands);
    dispatch({ type: 'apply-editor-project', project: next });
    setCommandPreview(null);
    setPendingEditorCommands([]);
    setCommandPreviewRevision(null);
    setStatus(`Đã áp dụng ${pendingEditorCommands.length} lệnh edit trong một transaction.`);
  };

  const aiPreviewCommands = async (text: string): Promise<void> => {
    setAiBusy(true);
    try {
      const result = await window.api.aiCommand(text, state.present, true);
      if (result.revision !== (state.present.revision ?? 0)) {
        setStatus('Kết quả AI đã cũ vì project đã thay đổi.');
        return;
      }
      setPendingEditorCommands(result.commands);
      setCommandPreview(simulateEditorCommands(state.present, result.commands));
      setCommandPreviewRevision(state.present.revision ?? 0);
      setStatus(`AI local (${result.mode}) đã tạo ${result.commands.length} lệnh; hãy xem trước rồi xác nhận.`);
    } catch (error) {
      setStatus(`AI local chưa chạy: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAiBusy(false);
    }
  };

  const runtimeReady = runtimeReport?.ready ?? false;

  if (!runtimeReady) {
    return <RuntimeSetup report={runtimeReport} progress={runtimeProgress} busy={runtimeBusy} onDownload={downloadRuntime} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div><div className="brand-name">Auto Podcast</div><div className="brand-subtitle">EDITOR · LOCAL PROCESSING</div></div>
        </div>
        <div className="project-meta">
          <span className="project-name">{state.present.name || 'Untitled project'}</span>
          <span className="status-pill">● {status}</span>
        </div>
        <nav className="topbar-actions" aria-label="Project actions">
          <button className="primary" onClick={() => void importMedia()} disabled={busy || !runtimeReady}>＋ Thêm nguồn</button>
          <button onClick={openProject} disabled={busy}>Mở</button>
          <button onClick={saveProject} disabled={busy || !state.present.sourcePath}>Lưu</button>
          <button onClick={transcribe} disabled={busy || !runtimeReady || !state.present.sourcePath}>Phân tích</button>
          {busy && <button onClick={cancel}>Hủy</button>}
          <select className="format-select" value={state.present.preset} onChange={(event) => dispatch({ type: 'set-preset', preset: event.target.value as 'vertical' | 'horizontal' })} aria-label="Khổ hình">
            <option value="vertical">Dọc 9:16</option>
            <option value="horizontal">Ngang 16:9</option>
          </select>
          <button className="primary" onClick={() => setExportOpen(true)} disabled={busy || !runtimeReady || !state.present.sourcePath}>Xuất video</button>
        </nav>
      </header>

      <div className="workspace">
        <aside className="left-rail">
          <div className="rail-title"><span>Bộ công cụ</span><span>⌘ K</span></div>
          <SourceBin assets={state.present.assets} onAdd={() => void importMedia()} onDrop={(paths) => void importMedia(paths)} onInsert={(assetId) => dispatch({ type: 'insert-asset', assetId, at: state.present.durationSec })} onRemove={(assetId) => {
            if (state.present.clips.some((clip) => clip.assetId === assetId)) setStatus('Nguồn đang được dùng trên timeline; hãy xóa clip trước.');
            else dispatch({ type: 'remove-asset', assetId });
          }} />
          <div className="rail-section"><CommandPanel onPreview={previewCommands} onApply={applyCommands} preview={commandPreview} onAiPreview={aiPreviewCommands} aiBusy={aiBusy} /></div>
          <div className="rail-section"><CutProposals proposals={state.present.proposals} onApply={applySelectedProposals} /></div>
          <div className="rail-section"><SfxLibrary onAdd={(asset) => dispatch({ type: 'add-sfx', clip: makeSfxClip(asset, 0) })} /></div>
        </aside>

        <main className="center-stage">
          <section className="preview-stage">
            <div className="stage-toolbar"><strong>Preview</strong><span className="subtle">{state.present.preset === 'vertical' ? '1080 × 1920' : '1920 × 1080'} · 30 fps</span><span className="subtle">{state.present.durationSec.toFixed(2)}s</span></div>
            <div className="preview-canvas">
              <Preview sourcePath={state.present.sourcePath} assets={state.present.assets} clips={state.present.clips} captions={state.present.captions} sfx={state.present.sfx} subtitleStyle={state.present.subtitleStyle} items={state.present.items} tracks={state.present.tracks} timebase={state.present.timebase} preset={state.present.preset} audioPreset={state.present.voicePreset ?? 'podcast'} audioChain={state.present.audioChains.find((chain) => chain.trackId === 'A1')} />
            </div>
          </section>

          <section className="timeline-stage">
            <div className="timeline-toolbar"><strong>Timeline</strong><div className="timeline-toolbar-actions"><span className="subtle">{state.present.clips.length} clips · snap 1 frame</span><button title="Fit timeline">Fit</button></div></div>
            <div className="timeline-host">
              <Timeline
          clips={state.present.clips}
          waveform={waveform}
          tracks={state.present.tracks}
          durationSec={state.present.durationSec}
          selectedId={selectedClipId}
          selectedIds={selectedClipIds}
          onSelect={setSelectedClipId}
          onSelectMany={(ids) => { setSelectedClipIds(ids); setSelectedClipId(ids[0] ?? null); }}
          onMove={(id, delta) => dispatch({ type: 'move-clip', id, delta })}
          onMoveMany={(ids, delta) => dispatch({ type: 'move-clips', ids, delta })}
          onTrim={(id, edge, delta) => dispatch({ type: 'trim-clip', id, edge, delta })}
          onSplit={(id) => {
            const clip = state.present.clips.find((c) => c.id === id);
            if (clip) dispatch({ type: 'split-clip', id, at: clip.start + 1 });
          }}
          onDelete={(id) => dispatch({ type: 'delete-clip', id })}
          onDeleteMany={(ids) => dispatch({ type: 'delete-clips', ids })}
          onRippleDelete={(id) => dispatch({ type: 'ripple-delete-clip', id })}
          onTrackChange={(id, track) => dispatch({ type: 'set-clip-track', id, track })}
          onTrackMuted={(id, muted) => dispatch({ type: 'set-track-muted', id, muted })}
          onTrackLocked={(id, locked) => dispatch({ type: 'set-track-locked', id, locked })}
          onTrackHidden={(id, hidden) => dispatch({ type: 'set-track-hidden', id, hidden })}
              />
            </div>
          </section>
        </main>

        <aside className="right-rail">
          <div className="rail-title"><span>Inspector</span><span>{selectedClipId ? 'Clip selected' : 'Project'}</span></div>
          <section className="rail-section"><AudioMixer tracks={state.present.tracks} voicePreset={state.present.voicePreset ?? 'podcast'} onVoicePreset={(preset) => dispatch({ type: 'set-voice-preset', preset })} onMute={(id, muted) => dispatch({ type: 'set-track-muted', id, muted })} onSolo={(id, solo) => dispatch({ type: 'set-track-solo', id, solo })} onVolume={(id, volumeDb) => dispatch({ type: 'set-track-volume', id, volumeDb })} /></section>
          <section className="rail-section transition-panel"><div className="panel-header"><h2>Transition</h2><span className="badge">CUT</span></div><select value={transitionType} onChange={(event) => setTransitionType(event.target.value as typeof transitionType)} aria-label="Transition type">{TRANSITION_PRESETS.filter((preset) => preset.id !== 'hard-cut').map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select><button className="primary" onClick={() => dispatch({ type: 'set-transition-all', transition: transitionConfig(transitionType) })} disabled={state.present.clips.length < 2}>Áp dụng cho các cut</button></section>
          <section className="rail-section"><SfxEditor clips={state.present.sfx ?? []} onUpdate={(id, patch) => dispatch({ type: 'update-sfx', id, patch })} onDuplicate={(id) => dispatch({ type: 'duplicate-sfx', id })} onRemove={(id) => dispatch({ type: 'remove-sfx', id })} /></section>
          {doctor && <details className="doctor-panel"><summary>Runtime Doctor</summary><div className="doctor-grid">{Object.values(doctor).map((item) => <span className={item.ok ? 'doctor-ok' : 'doctor-fail'} key={item.name}>{item.ok ? '●' : '○'} {item.name}{item.llmMode ? ` · LLM: ${item.llmMode}` : ''}</span>)}</div></details>}
        </aside>
      </div>

      <footer className="statusbar">
        <div className="statusbar-progress">{busy && <><progress max={100} value={progress} /><span>{progress}%</span></>}<span>{busy ? 'Đang xử lý…' : 'Sẵn sàng'}</span></div>
        <div className="statusbar-right"><span>{state.present.clips.length} clip</span><span>{state.present.captions.length} caption</span><span>{state.present.proposals.length} đề xuất</span><span>Local processing</span></div>
      </footer>
      {exportOpen && <ExportDialog project={state.present} onClose={() => setExportOpen(false)} onExport={exportProject} />}
    </div>
  );
}
