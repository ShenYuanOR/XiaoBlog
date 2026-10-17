import { contextBridge, ipcRenderer } from 'electron';
import type { AppInfo, IpcResult } from '@xiao/core/ipc';

const api = {
  app: {
    getInfo: (): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke('app:getInfo'),
  },
};

contextBridge.exposeInMainWorld('xiao', api);
