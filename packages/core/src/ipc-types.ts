export interface IpcOk<T> {
  ok: true;
  data: T;
}

export interface IpcErr {
  ok: false;
  code: string;
  message: string;
  detail?: string;
}

export type IpcResult<T> = IpcOk<T> | IpcErr;

export interface AppInfo {
  name: string;
  version: string;
  packaged: boolean;
}

export type RuntimeKind = 'install' | 'dev' | 'build';

export interface RuntimeStart {
  taskId: string;
  kind: RuntimeKind;
}

export interface RuntimeLogEvent {
  taskId: string;
  text: string;
}

export interface RuntimeExitEvent {
  taskId: string;
  code: number;
  message?: string;
  /** 被下一次构建或安装主动停掉，不是预览自己崩溃。 */
  replaced?: boolean;
}

export function ok<T>(data: T): IpcOk<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, detail?: string): IpcErr {
  return detail === undefined ? { ok: false, code, message } : { ok: false, code, message, detail };
}
