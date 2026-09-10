import { contextBridge, ipcRenderer } from 'electron';
import type { ExportRequest } from '../core/export.js';
import type { SfxAsset } from '../core/sfxLibrary.js';
import type { Project } from '../core/types.js';

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
  listSfx: () => ipcRenderer.invoke('sfx:list') as Promise<SfxAsset[]>,
  importSfx: (sourcePath: string) => ipcRenderer.invoke('sfx:import', sourcePath) as Promise<SfxAsset>,
  probe: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
  transcribe: (filePath: string, modelPath: string) =>
    ipcRenderer.invoke('ai:transcribe', filePath, modelPath),
  render: (project: Project, request: ExportRequest) =>
    ipcRenderer.invoke('job:render', project, request),
  cancel: () => ipcRenderer.invoke('job:cancel'),
  reset: () => ipcRenderer.invoke('job:reset'),
  onProgress: (cb: (p: { name: string; fraction: number }) => void) => {
    const listener = (_e: unknown, p: { name: string; fraction: number }) => cb(p);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  },
});
