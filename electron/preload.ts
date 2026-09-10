import { contextBridge, ipcRenderer } from 'electron';
import type { ExportRequest } from '../core/export.js';
import type { Project } from '../core/types.js';

contextBridge.exposeInMainWorld('api', {
  openVideo: () => ipcRenderer.invoke('dialog:open-video'),
  openModel: () => ipcRenderer.invoke('dialog:open-model'),
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
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
