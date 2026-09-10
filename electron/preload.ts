import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  probe: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
  transcribe: (filePath: string, workDir: string, modelPath: string) =>
    ipcRenderer.invoke('ai:transcribe', filePath, workDir, modelPath),
  render: (projectPath: string, preset: 'vertical' | 'horizontal', propsPath: string) =>
    ipcRenderer.invoke('job:render', projectPath, preset, propsPath),
});
