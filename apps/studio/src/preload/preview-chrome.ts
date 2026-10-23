import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('xiaoChrome', {
  setMode: (mode: string) => ipcRenderer.send('preview:chrome-mode', mode),
});
