import type { AppInfo, IpcResult } from '@xiao/core/ipc';

export interface XiaoApi {
  app: {
    getInfo: () => Promise<IpcResult<AppInfo>>;
  };
}

declare global {
  interface Window {
    xiao: XiaoApi;
    __csp?: string[];
  }
}

export {};
