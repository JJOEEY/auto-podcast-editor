import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  openVideo: () => ipcRenderer.invoke('dialog:open-video'),
  openModel: () => ipcRenderer.invoke('dialog:open-model'),
  probe: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
  transcribe: (filePath: string, modelPath: string) =>
    ipcRenderer.invoke('ai:transcribe', filePath, modelPath),
  render: (projectPath: string, preset: 'vertical' | 'horizontal', propsPath: string) =>
    ipcRenderer.invoke('job:render', projectPath, preset, propsPath),
  cancel: () => ipcRenderer.invoke('job:cancel'),
  reset: () => ipcRenderer.invoke('job:reset'),
  onProgress: (cb: (p: { name: string; fraction: number }) => void) => {
    const listener = (_e: unknown, p: { name: string; fraction: number }) => cb(p);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  },
});
