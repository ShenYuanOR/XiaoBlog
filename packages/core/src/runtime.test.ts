import { describe, expect, it } from 'vitest';
import { astroCommand, installArgs, readyUrl, storeDirFor, windowsShim } from './runtime.ts';

describe('运行时纯逻辑', () => {
  it('从带颜色的日志里认出 dev 地址', () => {
    expect(readyUrl('\u001b[32mastro\u001b[0m http://127.0.0.1:4321/\n')).toBe(
      'http://127.0.0.1:4321/',
    );
  });

  it('Windows shim 把 Electron 当成 node', () => {
    expect(windowsShim('C:\\App\\晓.exe')).toContain('set ELECTRON_RUN_AS_NODE=1');
    expect(windowsShim('C:\\App\\晓.exe')).toContain('"C:\\App\\晓.exe" %*');
  });

  it('dev 指定端口，安装先离线', () => {
    expect(astroCommand('dev', 4400)).toEqual(['dev', '--host', '127.0.0.1', '--port', '4400']);
    expect(installArgs(true)).toContain('--offline');
    expect(installArgs(false)).toContain('--prefer-offline');
  });

  it('离线仓库跟站点盘符', () => {
    expect(storeDirFor('F:\\sites\\demo')).toBe('F:\\.xiao-pnpm-store');
  });
});
