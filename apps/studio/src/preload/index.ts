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
  canvas: {
    components: () => ipcRenderer.invoke('canvas:components'),
    outline: (siteDir: string) => ipcRenderer.invoke('canvas:outline', siteDir),
    insert: (siteDir: string, parentId: string, index: number, name: string) =>
      ipcRenderer.invoke('canvas:insert', siteDir, parentId, index, name),
    move: (siteDir: string, nodeId: string, parentId: string, index: number) =>
      ipcRenderer.invoke('canvas:move', siteDir, nodeId, parentId, index),
    canNest: (parentName: string, childName: string) =>
      ipcRenderer.invoke('canvas:canNest', parentName, childName),
    props: (name: string) => ipcRenderer.invoke('canvas:props', name),
    setProp: (siteDir: string, nodeId: string, name: string, value: string | number | boolean) =>
      ipcRenderer.invoke('canvas:setProp', siteDir, nodeId, name, value),
  },
  seo: {
    check: (siteDir: string) => ipcRenderer.invoke('seo:check', siteDir),
  },
  settings: {
    read: (siteDir: string) => ipcRenderer.invoke('settings:read', siteDir),
    write: (siteDir: string, config: unknown) =>
      ipcRenderer.invoke('settings:write', siteDir, config),
  },
  content: {
    list: (
      siteDir: string,
    ): Promise<IpcResult<{ slug: string; title: string; category: string; draft: boolean }[]>> =>
      ipcRenderer.invoke('content:list', siteDir),
    create: (siteDir: string, title: string, category: string) =>
      ipcRenderer.invoke('content:create', siteDir, title, category),
    remove: (siteDir: string, slug: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('content:delete', siteDir, slug),
    rename: (
      siteDir: string,
      from: string,
      to: string,
    ): Promise<IpcResult<{ from: string; to: string }>> =>
      ipcRenderer.invoke('content:rename', siteDir, from, to),
    read: (siteDir: string, slug: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('content:read', siteDir, slug),
    write: (siteDir: string, slug: string, markdown: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('content:write', siteDir, slug, markdown),
    saveImage: (
      siteDir: string,
      slug: string,
      name: string,
      base64: string,
    ): Promise<IpcResult<string>> =>
      ipcRenderer.invoke('content:saveImage', siteDir, slug, name, base64),
  },
  preview: {
    set: (mode: 'phone' | 'tablet' | 'pc' | 'custom' | 'side', url: string, customWidth?: number) =>
      ipcRenderer.invoke('preview:set', mode, url, customWidth),
  },
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
