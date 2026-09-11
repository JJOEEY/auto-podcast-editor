import { contextBridge, ipcRenderer } from 'electron';
import type { ExportRequest } from '../core/export.js';
import type { SfxAsset } from '../core/sfxLibrary.js';
import type { Project } from '../core/types.js';
import type { ProjectV2, EditorCommand } from '../core/types.js';
import type { AudioChain } from '../core/types.js';
import type { WaveformCache } from '../core/waveform.js';
import type { RuntimeAssetProgress } from './runtimeAssets.js';

contextBridge.exposeInMainWorld('api', {
  openVideo: () => ipcRenderer.invoke('dialog:open-video'),
  openModel: () => ipcRenderer.invoke('dialog:open-model'),
  defaultModel: () => ipcRenderer.invoke('model:default') as Promise<string | null>,
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  openSfx: () => ipcRenderer.invoke('dialog:open-sfx'),
  openProject: () => ipcRenderer.invoke('dialog:open-project'),
  saveProject: (suggestedName: string) => ipcRenderer.invoke('dialog:save-project', suggestedName),
  loadProject: (filePath: string) => ipcRenderer.invoke('project:load', filePath),
  writeProject: (filePath: string, project: Project) => ipcRenderer.invoke('project:save', filePath, project),
  capabilities: () => ipcRenderer.invoke('ffmpeg:capabilities'),
  doctor: () => ipcRenderer.invoke('runtime:doctor'),
  runtimeAssets: () => ipcRenderer.invoke('runtime:assets'),
  downloadRuntime: () => ipcRenderer.invoke('runtime:download'),
  listSfx: () => ipcRenderer.invoke('sfx:list') as Promise<SfxAsset[]>,
  importSfx: (sourcePath: string) => ipcRenderer.invoke('sfx:import', sourcePath) as Promise<SfxAsset>,
  probe: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
  mediaUrl: (filePath: string) => ipcRenderer.invoke('media:url', filePath) as Promise<string>,
  waveform: (filePath: string) => ipcRenderer.invoke('media:waveform', filePath) as Promise<WaveformCache>,
  audioPreview: (filePath: string, preset: 'none' | 'clean' | 'podcast' | 'broadcast' | 'warm', chain?: AudioChain) =>
    ipcRenderer.invoke('audio:preview', filePath, preset, chain) as Promise<{ path: string; cacheHit: boolean }>,
  transcribe: (filePath: string, modelPath: string) =>
    ipcRenderer.invoke('ai:transcribe', filePath, modelPath),
  aiCommand: (text: string, project: ProjectV2, cpuOptIn: boolean) =>
    ipcRenderer.invoke('ai:command', text, project, cpuOptIn) as Promise<{ commands: EditorCommand[]; revision: number; mode: 'gpu' | 'cpu' }>,
  render: (project: Project, request: ExportRequest) =>
    ipcRenderer.invoke('job:render', project, request),
  cancel: () => ipcRenderer.invoke('job:cancel'),
  reset: () => ipcRenderer.invoke('job:reset'),
  captureMode: () => ipcRenderer.invoke('capture:is-mode') as Promise<boolean>,
  captureProject: () => ipcRenderer.invoke('capture:project') as Promise<Project | null>,
  onProgress: (cb: (p: { name: string; fraction: number }) => void) => {
    const listener = (_e: unknown, p: { name: string; fraction: number }) => cb(p);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  },
  onRuntimeAssetProgress: (cb: (p: RuntimeAssetProgress) => void) => {
    const listener = (_e: unknown, p: RuntimeAssetProgress) => cb(p);
    ipcRenderer.on('runtime:asset-progress', listener);
    return () => ipcRenderer.removeListener('runtime:asset-progress', listener);
  },
});
