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
