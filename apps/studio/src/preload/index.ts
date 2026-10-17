import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AppInfo,
  IpcResult,
  RuntimeExitEvent,
  RuntimeKind,
  RuntimeLogEvent,
  RuntimeStart,
} from '@xiao/core/ipc';
import type { ConflictEvent, ReloadEvent } from './watch.ts';

function listen<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  app: {
    getInfo: (): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke('app:getInfo'),
  },
  project: {
    recent: (): Promise<IpcResult<{ dir: string; title: string; openedAt: string }[]>> =>
      ipcRenderer.invoke('project:recent'),
    pick: (): Promise<IpcResult<string | null>> => ipcRenderer.invoke('project:pick'),
    create: (
      parent: string,
      title: string,
      author: string,
    ): Promise<IpcResult<{ dir: string; title: string }>> =>
      ipcRenderer.invoke('project:create', parent, title, author),
    open: (dir?: string): Promise<IpcResult<{ dir: string; title: string } | null>> =>
      ipcRenderer.invoke('project:open', dir),
    markDirty: (file: string, content: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('project:markDirty', file, content),
    noteWrite: (file: string, content: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('project:noteWrite', file, content),
    resolve: (file: string, action: 'keep' | 'load'): Promise<IpcResult<ReloadEvent | null>> =>
      ipcRenderer.invoke('project:resolve', file, action),
    onReload: (callback: (payload: ReloadEvent) => void): (() => void) =>
      listen('project:onReload', callback),
    onConflict: (callback: (payload: ConflictEvent) => void): (() => void) =>
      listen('project:onConflict', callback),
  },
  runtime: {
    start: (kind: RuntimeKind, siteDir: string): Promise<IpcResult<RuntimeStart>> =>
      ipcRenderer.invoke('runtime:start', kind, siteDir),
    cancel: (taskId: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('runtime:cancel', taskId),
    onLog: (callback: (payload: RuntimeLogEvent) => void): (() => void) =>
      listen('runtime:onLog', callback),
    onReady: (callback: (payload: { taskId: string; url: string }) => void): (() => void) =>
      listen('runtime:onReady', callback),
    onExit: (callback: (payload: RuntimeExitEvent) => void): (() => void) =>
      listen('runtime:onExit', callback),
  },
};

contextBridge.exposeInMainWorld('xiao', api);
