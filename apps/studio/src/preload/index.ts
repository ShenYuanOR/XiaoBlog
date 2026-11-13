import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AppInfo,
  IpcResult,
  RuntimeExitEvent,
  RuntimeKind,
  RuntimeLogEvent,
  RuntimeStart,
} from '@xiao/core/ipc';
import type { ConflictEvent, ReloadEvent } from '../main/watch.ts';
import type {
  MediaDeleteResult,
  MediaItem,
  MediaRenameResult,
  MediaUploadInput,
  MediaUploadResult,
} from '../main/media.ts';

function listen<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  section: {
    list: (siteDir: string) => ipcRenderer.invoke('section:list', siteDir),
    save: (siteDir: string, file: string, nodeId: string, label: string) =>
      ipcRenderer.invoke('section:save', siteDir, file, nodeId, label),
    usage: (siteDir: string, names: string[]) =>
      ipcRenderer.invoke('section:usage', siteDir, names),
  },
  article: {
    css: (siteDir: string) => ipcRenderer.invoke('article:css', siteDir),
  },
  canvas: {
    components: () => ipcRenderer.invoke('canvas:components'),
    outline: (siteDir: string, file: string) => ipcRenderer.invoke('canvas:outline', siteDir, file),
    insert: (siteDir: string, parentId: string, index: number, name: string, file: string) =>
      ipcRenderer.invoke('canvas:insert', siteDir, parentId, index, name, file),
    move: (siteDir: string, nodeId: string, parentId: string, index: number, file: string) =>
      ipcRenderer.invoke('canvas:move', siteDir, nodeId, parentId, index, file),
    remove: (siteDir: string, nodeId: string, file: string) =>
      ipcRenderer.invoke('canvas:remove', siteDir, nodeId, file),
    duplicate: (siteDir: string, nodeId: string, file: string) =>
      ipcRenderer.invoke('canvas:duplicate', siteDir, nodeId, file),
    wrap: (siteDir: string, nodeId: string, wrapperSnippet: string, file: string) =>
      ipcRenderer.invoke('canvas:wrap', siteDir, nodeId, wrapperSnippet, file),
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
    create: (
      siteDir: string,
      template: 'blank' | 'docs' | 'landing' | 'magazine' | 'about',
      slug: string,
    ) => ipcRenderer.invoke('page:create', siteDir, template, slug),
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
    ): Promise<
      IpcResult<
        {
          slug: string;
          title: string;
          category: string;
          description: string;
          tags: string[];
          draft: boolean;
          date: string;
          cover: string;
          format: 'markdown' | 'html';
        }[]
      >
    > => ipcRenderer.invoke('content:list', siteDir),
    /**
     * 主进程 content:create handler 目前只转发 3 个参数；HTML 新建时把
     * `{ category, format }` 放进 category 位，content.ts 两种入参都兼容。
     */
    create: (
      siteDir: string,
      title: string,
      category: string,
      format: 'markdown' | 'html' = 'markdown',
      standalone = false,
    ) => ipcRenderer.invoke('content:create', siteDir, title, category, format, standalone),
    customize: (siteDir: string, slug: string) =>
      ipcRenderer.invoke('content:customize', siteDir, slug),
    layoutRead: (
      siteDir: string,
      slug: string,
    ): Promise<
      IpcResult<{ custom: boolean; defaultText: string; customText: string; file: string }>
    > => ipcRenderer.invoke('content:layoutRead', siteDir, slug),
    resetLayout: (siteDir: string, slug: string): Promise<IpcResult<{ backup: string }>> =>
      ipcRenderer.invoke('content:resetLayout', siteDir, slug),
    remove: (siteDir: string, slug: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('content:delete', siteDir, slug),
    rename: (
      siteDir: string,
      from: string,
      to: string,
    ): Promise<IpcResult<{ from: string; to: string }>> =>
      ipcRenderer.invoke('content:rename', siteDir, from, to),
    /** 兼容旧调用方（SEO 等）：只返回全文。新代码请用 readPost 拿格式。 */
    read: async (siteDir: string, slug: string): Promise<IpcResult<string>> => {
      const result = (await ipcRenderer.invoke('content:read', siteDir, slug)) as IpcResult<{
        text: string;
        format: 'markdown' | 'html';
      }>;
      return result.ok ? { ok: true, data: result.data.text } : result;
    },
    readPost: (
      siteDir: string,
      slug: string,
    ): Promise<IpcResult<{ text: string; format: 'markdown' | 'html' }>> =>
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
  media: {
    list: (siteDir: string): Promise<IpcResult<MediaItem[]>> =>
      ipcRenderer.invoke('media:list', siteDir),
    upload: (
      siteDir: string,
      files: MediaUploadInput[],
      target?: string,
    ): Promise<IpcResult<MediaUploadResult>> =>
      ipcRenderer.invoke('media:upload', siteDir, files, target),
    delete: (
      siteDir: string,
      relPaths: string[],
      force?: boolean,
    ): Promise<IpcResult<MediaDeleteResult>> =>
      ipcRenderer.invoke('media:delete', siteDir, relPaths, force),
    rename: (
      siteDir: string,
      relPath: string,
      newName: string,
    ): Promise<IpcResult<MediaRenameResult>> =>
      ipcRenderer.invoke('media:rename', siteDir, relPath, newName),
  },
  preview: {
    set: (mode: 'phone' | 'tablet' | 'pc' | 'custom' | 'side', url: string, customWidth?: number) =>
      ipcRenderer.invoke('preview:set', mode, url, customWidth),
    focus: (
      file: string,
      offset: string,
      label?: string,
      handles?: { width?: boolean; pad?: boolean },
    ) => ipcRenderer.invoke('preview:focus', file, offset, label, handles),
    focusSelector: (selector: string) => ipcRenderer.invoke('preview:focusSelector', selector),
    hit: (x: number, y: number) =>
      ipcRenderer.invoke('preview:hit', x, y) as Promise<
        IpcResult<{
          file: string;
          offset: string;
          place: 'before' | 'after' | 'into';
          tag: string;
        } | null>
      >,
    drop: (
      hit: { file: string; offset: string; place: 'before' | 'after' | 'into'; tag: string } | null,
    ) => ipcRenderer.invoke('preview:drop', hit),
    zoom: (value: number) => ipcRenderer.invoke('preview:zoom', value),
    onPick: (callback: (payload: { file: string; offset: string }) => void): (() => void) =>
      listen('preview:onPick', callback),
    onResize: (callback: (payload: { prop: 'width' | 'pad'; px: number }) => void): (() => void) =>
      listen('preview:onResize', callback),
    onCamera: (callback: (payload: { zoom: number }) => void): (() => void) =>
      listen('preview:onCamera', callback),
    onText: (
      callback: (payload: { file: string; offset: string; text: string }) => void,
    ): (() => void) => listen('preview:onText', callback),
    editor: (
      url: string,
      bounds: { x: number; y: number; width: number; height: number } | null,
      interactive = false,
    ): Promise<IpcResult<null>> => {
      document.dispatchEvent(
        new CustomEvent('xiao:preview-editor', { detail: { url, bounds, interactive } }),
      );
      return Promise.resolve({ ok: true, data: null });
    },
    dock: (input: {
      enabled: boolean;
      url: string;
      device: 'phone' | 'tablet' | 'pc' | 'side';
      bounds: { x: number; y: number; width: number; height: number };
      zoom?: number;
      interactive?: boolean;
    }): Promise<IpcResult<null>> => {
      document.dispatchEvent(new CustomEvent('xiao:preview-dock', { detail: input }));
      return Promise.resolve({ ok: true, data: null });
    },
    expect: (name: string, url: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('preview:expect', name, url),
    reload: (): Promise<IpcResult<null>> => ipcRenderer.invoke('preview:reload'),
    hideDock: (): Promise<IpcResult<null>> => {
      document.dispatchEvent(new CustomEvent('xiao:preview-hide-dock'));
      return Promise.resolve({ ok: true, data: null });
    },
    catalog: (items: { name: string; label: string }[]): void => {
      ipcRenderer.send('preview:catalog', items);
    },
    onInsertBlock: (
      callback: (payload: {
        file: string;
        offset: string;
        name: string;
        place: 'before' | 'after' | 'into';
      }) => void,
    ): (() => void) => listen('preview:onInsertBlock', callback),
    windowOpen: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke('preview:windowOpen'),
    onWindow: (callback: (payload: { open: boolean }) => void): (() => void) =>
      listen('preview:onWindow', callback),
  },
  app: {
    getInfo: (): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke('app:getInfo'),
    openExternal: (url: string): Promise<IpcResult<null>> =>
      ipcRenderer.invoke('app:openExternal', url),
    setTitleBarOverlay: (overlay: {
      color: string;
      symbolColor: string;
      height: number;
    }): Promise<IpcResult<null>> => ipcRenderer.invoke('app:titleBarOverlay', overlay),
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
    onStart: (callback: (payload: RuntimeStart) => void): (() => void) =>
      listen('runtime:onStart', callback),
    onReady: (callback: (payload: { taskId: string; url: string }) => void): (() => void) =>
      listen('runtime:onReady', callback),
    onExit: (callback: (payload: RuntimeExitEvent) => void): (() => void) =>
      listen('runtime:onExit', callback),
  },
};

if (process.isMainFrame !== false) {
  contextBridge.exposeInMainWorld('xiao', api);
}
