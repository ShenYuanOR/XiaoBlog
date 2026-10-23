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
    outline: (siteDir: string, file: string) => ipcRenderer.invoke('canvas:outline', siteDir, file),
    insert: (siteDir: string, parentId: string, index: number, name: string, file: string) =>
      ipcRenderer.invoke('canvas:insert', siteDir, parentId, index, name, file),
    move: (siteDir: string, nodeId: string, parentId: string, index: number, file: string) =>
      ipcRenderer.invoke('canvas:move', siteDir, nodeId, parentId, index, file),
    canNest: (parentName: string, childName: string) =>
      ipcRenderer.invoke('canvas:canNest', parentName, childName),
    undo: (siteDir: string, file: string) => ipcRenderer.invoke('canvas:undo', siteDir, file),
    redo: (siteDir: string, file: string) => ipcRenderer.invoke('canvas:redo', siteDir, file),
    props: (name: string) => ipcRenderer.invoke('canvas:props', name),
    setText: (siteDir: string, nodeId: string, text: string, file: string) =>
      ipcRenderer.invoke('canvas:setText', siteDir, nodeId, text, file),
    setVisual: (siteDir: string, elementId: string, text: string, file: string) =>
      ipcRenderer.invoke('canvas:setVisual', siteDir, elementId, text, file),
    setProp: (
      siteDir: string,
      nodeId: string,
      name: string,
      value: string | number | boolean,
      file: string,
    ) => ipcRenderer.invoke('canvas:setProp', siteDir, nodeId, name, value, file),
  },
  publish: {
    changes: (siteDir: string) => ipcRenderer.invoke('publish:changes', siteDir),
    history: (siteDir: string) => ipcRenderer.invoke('publish:history', siteDir),
    record: (siteDir: string, repo: string) => ipcRenderer.invoke('publish:record', siteDir, repo),
    target: (siteDir: string) => ipcRenderer.invoke('publish:target', siteDir),
    connect: (
      siteDir: string,
      provider: 'gitea' | 'github',
      remoteUrl: string,
      login: string,
      token: string,
    ) => ipcRenderer.invoke('publish:connect', siteDir, provider, remoteUrl, login, token),
    push: (siteDir: string, force?: boolean) => ipcRenderer.invoke('publish:push', siteDir, force),
    repair: (siteDir: string) => ipcRenderer.invoke('publish:repair', siteDir),
    disconnect: (siteDir: string) => ipcRenderer.invoke('publish:disconnect', siteDir),
  },
  wizard: {
    write: (siteDir: string, owner: string, repo: string, branch: string) =>
      ipcRenderer.invoke('wizard:write', siteDir, owner, repo, branch),
  },
  secret: {
    save: (repo: string, token: string, expires: string) =>
      ipcRenderer.invoke('secret:save', repo, token, expires),
    list: () => ipcRenderer.invoke('secret:list'),
    remove: (repo: string) => ipcRenderer.invoke('secret:remove', repo),
  },
  github: {
    repo: (owner: string, name: string) => ipcRenderer.invoke('github:repo', owner, name),
  },
  dev: {
    files: (siteDir: string) => ipcRenderer.invoke('dev:files', siteDir),
    read: (siteDir: string, file: string) => ipcRenderer.invoke('dev:read', siteDir, file),
    write: (siteDir: string, file: string, content: string) =>
      ipcRenderer.invoke('dev:write', siteDir, file, content),
    lint: (siteDir: string, file: string) => ipcRenderer.invoke('dev:lint', siteDir, file),
  },
  page: {
    list: (siteDir: string) => ipcRenderer.invoke('page:list', siteDir),
    create: (siteDir: string, template: 'blank' | 'landing' | 'about', slug: string) =>
      ipcRenderer.invoke('page:create', siteDir, template, slug),
    href: (siteDir: string, file: string) => ipcRenderer.invoke('page:href', siteDir, file),
    styleRead: (siteDir: string, slug: string) =>
      ipcRenderer.invoke('page:styleRead', siteDir, slug),
    styleWrite: (siteDir: string, slug: string, css: string) =>
      ipcRenderer.invoke('page:styleWrite', siteDir, slug, css),
    styleReset: (siteDir: string, slug: string) =>
      ipcRenderer.invoke('page:styleReset', siteDir, slug),
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
    customize: (siteDir: string, slug: string) =>
      ipcRenderer.invoke('content:customize', siteDir, slug),
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
    focus: (file: string, offset: string) => ipcRenderer.invoke('preview:focus', file, offset),
    focusSelector: (selector: string) => ipcRenderer.invoke('preview:focusSelector', selector),
    onPick: (callback: (payload: { file: string; offset: string }) => void): (() => void) =>
      listen('preview:onPick', callback),
    onText: (
      callback: (payload: { file: string; offset: string; text: string }) => void,
    ): (() => void) => listen('preview:onText', callback),
    editor: (
      url: string,
      bounds: { x: number; y: number; width: number; height: number } | null,
    ): Promise<IpcResult<null>> => ipcRenderer.invoke('preview:editor', url, bounds),
    dock: (input: {
      enabled: boolean;
      url: string;
      device: 'phone' | 'tablet' | 'pc';
      bounds: { x: number; y: number; width: number; height: number };
    }): Promise<IpcResult<null>> => ipcRenderer.invoke('preview:dock', input),
    hideDock: (): Promise<IpcResult<null>> => ipcRenderer.invoke('preview:hideDock'),
  },
  app: {
    getInfo: (): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke('app:getInfo'),
    openExternal: (url: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('app:openExternal', url),
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
