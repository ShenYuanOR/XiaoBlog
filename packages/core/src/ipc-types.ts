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

export function ok<T>(data: T): IpcOk<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, detail?: string): IpcErr {
  return detail === undefined ? { ok: false, code, message } : { ok: false, code, message, detail };
}
