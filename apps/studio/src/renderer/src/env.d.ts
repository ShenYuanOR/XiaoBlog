import type {
  AppInfo,
  IpcResult,
  RuntimeExitEvent,
  RuntimeKind,
  RuntimeLogEvent,
  RuntimeStart,
} from '@xiao/core/ipc';

export interface XiaoApi {
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
