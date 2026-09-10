import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  probe: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
  transcribe: (filePath: string) => ipcRenderer.invoke('ai:transcribe', filePath),
  render: (projectPath: string) => ipcRenderer.invoke('job:render', projectPath),
});
