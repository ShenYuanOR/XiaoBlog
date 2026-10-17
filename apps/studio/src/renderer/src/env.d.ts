import type {
  AppInfo,
  IpcResult,
  RuntimeExitEvent,
  RuntimeKind,
  RuntimeLogEvent,
  RuntimeStart,
} from '@xiao/core/ipc';

export interface CanvasNode {
  id: string;
  name: string;
  locked: boolean;
  props: { name: string; value: string }[];
  children: CanvasNode[];
}

export interface CanvasField {
  name: string;
  label: string;
  type: string;
  options?: string[];
}

export interface XiaoApi {
  canvas: {
    components: () => Promise<IpcResult<string[]>>;
    outline: (siteDir: string, file: string) => Promise<IpcResult<CanvasNode[]>>;
    insert: (
      siteDir: string,
      parentId: string,
      index: number,
      name: string,
      file: string,
    ) => Promise<IpcResult<null>>;
    move: (
      siteDir: string,
      nodeId: string,
      parentId: string,
      index: number,
      file: string,
    ) => Promise<IpcResult<null>>;
    canNest: (parentName: string, childName: string) => Promise<IpcResult<boolean>>;
    undo: (siteDir: string, file: string) => Promise<IpcResult<null>>;
    redo: (siteDir: string, file: string) => Promise<IpcResult<null>>;
    props: (name: string) => Promise<IpcResult<CanvasField[]>>;
    setProp: (
      siteDir: string,
      nodeId: string,
      name: string,
      value: string | number | boolean,
      file: string,
    ) => Promise<IpcResult<null>>;
  };
  wizard: {
    write: (
      siteDir: string,
      owner: string,
      repo: string,
      branch: string,
    ) => Promise<IpcResult<null>>;
  };
  secret: {
    save: (repo: string, token: string, expires: string) => Promise<IpcResult<null>>;
    list: () => Promise<IpcResult<{ repo: string; expires: string }[]>>;
    remove: (repo: string) => Promise<IpcResult<null>>;
  };
  github: {
    repo: (owner: string, name: string) => Promise<IpcResult<{ status: number }>>;
  };
  dev: {
    files: (siteDir: string) => Promise<IpcResult<string[]>>;
    read: (siteDir: string, file: string) => Promise<IpcResult<string>>;
    write: (siteDir: string, file: string, content: string) => Promise<IpcResult<null>>;
    lint: (
      siteDir: string,
      file: string,
    ) => Promise<IpcResult<{ line: number; message: string }[]>>;
  };
  page: {
    list: (siteDir: string) => Promise<IpcResult<string[]>>;
    create: (
      siteDir: string,
      template: 'blank' | 'landing' | 'about',
      slug: string,
    ) => Promise<IpcResult<string>>;
  };
  seo: {
    check: (
      siteDir: string,
    ) => Promise<IpcResult<{ level: string; rule: string; detail: string }[]>>;
  };
  settings: {
    read: (siteDir: string) => Promise<IpcResult<Record<string, unknown>>>;
    write: (siteDir: string, config: unknown) => Promise<IpcResult<string[]>>;
  };
  content: {
    list: (
      siteDir: string,
    ) => Promise<IpcResult<{ slug: string; title: string; category: string; draft: boolean }[]>>;
    create: (
      siteDir: string,
      title: string,
      category: string,
    ) => Promise<IpcResult<{ slug: string; title: string; category: string; draft: boolean }>>;
    customize: (siteDir: string, slug: string) => Promise<IpcResult<string>>;
    remove: (siteDir: string, slug: string) => Promise<IpcResult<null>>;
    rename: (
      siteDir: string,
      from: string,
      to: string,
    ) => Promise<IpcResult<{ from: string; to: string }>>;
    read: (siteDir: string, slug: string) => Promise<IpcResult<string>>;
    write: (siteDir: string, slug: string, markdown: string) => Promise<IpcResult<null>>;
    saveImage: (
      siteDir: string,
      slug: string,
      name: string,
      base64: string,
    ) => Promise<IpcResult<string>>;
  };
  preview: {
    set: (
      mode: 'phone' | 'tablet' | 'pc' | 'custom' | 'side',
      url: string,
      customWidth?: number,
    ) => Promise<IpcResult<number[]>>;
    focus: (file: string, offset: string) => Promise<IpcResult<null>>;
    focusSelector: (selector: string) => Promise<IpcResult<null>>;
    onPick: (callback: (payload: { file: string; offset: string }) => void) => () => void;
  };
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
  };
  project: {
    recent: () => Promise<IpcResult<{ dir: string; title: string; openedAt: string }[]>>;
    pick: () => Promise<IpcResult<string | null>>;
    create: (
      parent: string,
      title: string,
      author: string,
    ) => Promise<IpcResult<{ dir: string; title: string }>>;
    open: (dir?: string) => Promise<IpcResult<{ dir: string; title: string } | null>>;
    markDirty: (file: string, content: string) => Promise<IpcResult<null>>;
    noteWrite: (file: string, content: string) => Promise<IpcResult<null>>;
    resolve: (
      file: string,
      action: 'keep' | 'load',
    ) => Promise<IpcResult<{ file: string; content: string } | null>>;
    onReload: (callback: (payload: { file: string; content: string }) => void) => () => void;
    onConflict: (
      callback: (payload: { file: string; mine: string; disk: string }) => void,
    ) => () => void;
  };
  runtime: {
    start: (kind: RuntimeKind, siteDir: string) => Promise<IpcResult<RuntimeStart>>;
    cancel: (taskId: string) => Promise<IpcResult<null>>;
    onLog: (callback: (payload: RuntimeLogEvent) => void) => () => void;
    onReady: (callback: (payload: { taskId: string; url: string }) => void) => () => void;
    onExit: (callback: (payload: RuntimeExitEvent) => void) => () => void;
  };
}

declare global {
  interface Window {
    xiao: XiaoApi;
    __csp?: string[];
  }
}

export {};
