import type { RuntimeKind } from './ipc-types.ts';

export type { RuntimeKind };

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/** 从 Astro dev 日志里取出本地地址。 */
export function readyUrl(text: string): string | undefined {
  return stripAnsi(text).match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/?/)?.[0];
}

export function windowsShim(execPath: string): string {
  return `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${execPath}" %*\r\n`;
}

export function astroCommand(kind: RuntimeKind, port?: number): string[] {
  if (kind === 'dev') return ['dev', '--host', '127.0.0.1', '--port', String(port ?? 4321)];
  if (kind === 'build') return ['build'];
  return ['install'];
}

export function installArgs(offline: boolean): string[] {
  return ['install', offline ? '--offline' : '--prefer-offline', '--frozen-lockfile'];
}

/** 站点所在盘的离线仓库目录。 */
export function storeDirFor(siteDir: string): string {
  const match = /^[A-Za-z]:/.exec(siteDir.replaceAll('/', '\\'));
  const root = match ? `${match[0]}\\` : '\\';
  return `${root}.xiao-pnpm-store`;
}
