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
  kind: string;
  text: string;
  locked: boolean;
  props: { name: string; value: string }[];
  children: CanvasNode[];
}

export interface CanvasPropOption {
  value: string;
  label: string;
}

export interface CanvasField {
  name: string;
  label: string;
  type: string;
  options?: CanvasPropOption[];
  default?: unknown;
  unit?: string;
  min?: number;
  max?: number;
  group?: string;
  placeholder?: string;
  advanced?: boolean;
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
    setText: (
      siteDir: string,
      nodeId: string,
      text: string,
      file: string,
    ) => Promise<IpcResult<null>>;
    setVisual: (
      siteDir: string,
      elementId: string,
      text: string,
      file: string,
    ) => Promise<IpcResult<null>>;
    setProp: (
      siteDir: string,
      nodeId: string,
      name: string,
      value: string | number | boolean,
      file: string,
    ) => Promise<IpcResult<null>>;
  };
  publish: {
    changes: (
      siteDir: string,
    ) => Promise<IpcResult<{ posts: string[]; pages: string[]; settings: string[] }>>;
    history: (siteDir: string) => Promise<IpcResult<{ at: string; repo: string }[]>>;
    record: (siteDir: string, repo: string) => Promise<IpcResult<{ at: string; repo: string }[]>>;
    target: (siteDir: string) => Promise<
      IpcResult<{
        provider: 'gitea' | 'github';
        remoteUrl: string;
        branch: string;
        login?: string;
      } | null>
    >;
    connect: (
      siteDir: string,
      provider: 'gitea' | 'github',
      remoteUrl: string,
      login: string,
      token: string,
    ) => Promise<
      IpcResult<{
        provider: 'gitea' | 'github';
        remoteUrl: string;
        branch: string;
        login?: string;
        persisted?: boolean;
      }>
    >;
    push: (
      siteDir: string,
      force?: boolean,
    ) => Promise<
      IpcResult<{
        committed: boolean;
        forced: boolean;
        warnings: string[];
        message: string;
        remote: string;
        branch: string;
      }>
    >;
    disconnect: (siteDir: string) => Promise<IpcResult<null>>;
    repair: (siteDir: string) => Promise<IpcResult<{ backup: string; files: number }>>;
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
    href: (siteDir: string, file: string) => Promise<IpcResult<string>>;
    styleRead: (
      siteDir: string,
      slug: string,
    ) => Promise<IpcResult<{ css: string; exists: boolean }>>;
    styleWrite: (siteDir: string, slug: string, css: string) => Promise<IpcResult<null>>;
    styleReset: (siteDir: string, slug: string) => Promise<IpcResult<null>>;
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
    focus: (
      file: string,
      offset: string,
      label?: string,
      handles?: { width?: boolean; pad?: boolean },
    ) => Promise<IpcResult<null>>;
    focusSelector: (selector: string) => Promise<IpcResult<null>>;
    hit: (
      x: number,
      y: number,
    ) => Promise<
      IpcResult<{
        file: string;
        offset: string;
        place: 'before' | 'after' | 'into';
        tag: string;
      } | null>
    >;
    drop: (
      hit: { file: string; offset: string; place: 'before' | 'after' | 'into'; tag: string } | null,
    ) => Promise<IpcResult<null>>;
    zoom: (value: number) => Promise<IpcResult<null>>;
    onPick: (callback: (payload: { file: string; offset: string }) => void) => () => void;
    onResize: (callback: (payload: { prop: 'width' | 'pad'; px: number }) => void) => () => void;
    onCamera: (callback: (payload: { zoom: number }) => void) => () => void;
    onText: (
      callback: (payload: { file: string; offset: string; text: string }) => void,
    ) => () => void;
    editor: (
      url: string,
      bounds: { x: number; y: number; width: number; height: number } | null,
    ) => Promise<IpcResult<null>>;
    dock: (input: {
      enabled: boolean;
      url: string;
      device: 'phone' | 'tablet' | 'pc' | 'side';
      bounds: { x: number; y: number; width: number; height: number };
      zoom?: number;
    }) => Promise<IpcResult<null>>;
    hideDock: () => Promise<IpcResult<null>>;
  };
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
    openExternal: (url: string) => Promise<IpcResult<null>>;
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
