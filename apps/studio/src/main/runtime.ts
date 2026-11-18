import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { astroCommand, installArgs, readyUrl, storeDirFor, windowsShim } from '@xiao/core/runtime';
import type { RuntimeExitEvent, RuntimeKind, RuntimeLogEvent, RuntimeStart } from '@xiao/core/ipc';

export interface RuntimeHooks {
  onStart: (event: RuntimeStart) => void;
  onLog: (event: RuntimeLogEvent) => void;
  onReady: (event: { taskId: string; url: string }) => void;
  onExit: (event: RuntimeExitEvent) => void;
}

interface LiveTask {
  taskId: string;
  kind: RuntimeKind;
  siteDir: string;
  child?: ChildProcess;
  readyUrl?: string;
}

export class RuntimeService {
  private live = new Map<string, LiveTask>();
  private logs = new Map<string, string>();
  /** stopAll 主动杀掉的任务。退出事件不能当成预览崩溃。 */
  private replaced = new Set<string>();

  constructor(private readonly hooks: RuntimeHooks) {}

  shimDir(): string {
    const dir = app.isPackaged
      ? path.join(process.resourcesPath, 'shim')
      : path.join(process.cwd(), '.shim');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'node.cmd'), windowsShim(process.execPath));
    return dir;
  }

  pnpmPath(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'pnpm', 'pnpm.exe')
      : path.join(process.cwd(), 'resources', 'pnpm', 'pnpm.exe');
  }

  /** 这个站点的 dev 预览是否还在跑。必须在 start('build') 之前问，构建会先停掉它。 */
  devRunning(siteDir: string): boolean {
    const target = path.resolve(siteDir).toLowerCase();
    for (const task of this.live.values()) {
      if (task.kind === 'dev' && path.resolve(task.siteDir).toLowerCase() === target) return true;
    }
    return false;
  }

  /** 重新拉起 dev，并等到预览地址出来或进程退出。 */
  async resumeDev(
    siteDir: string,
  ): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
    const started = await this.start('dev', siteDir);
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const task = this.live.get(started.taskId);
      if (!task) return { ok: false, message: '预览进程退出了' };
      if (task.readyUrl) return { ok: true, url: task.readyUrl };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return { ok: false, message: '预览超过两分钟还没就绪' };
  }

  async start(
    kind: RuntimeKind,
    siteDir: string,
  ): Promise<RuntimeStart & { code?: number; log?: string }> {
    this.stopAll();
    const taskId = randomUUID();
    const task: LiveTask = { taskId, kind, siteDir };
    this.live.set(taskId, task);
    const start = { taskId, kind };
    this.hooks.onStart(start);
    if (kind === 'install') {
      const code = await this.install(task, siteDir);
      const log = this.logs.get(taskId) ?? '';
      this.logs.delete(taskId);
      return { ...start, code, log };
    }
    if (kind === 'build') {
      const code = await this.runAstro(task, siteDir);
      const log = this.logs.get(taskId) ?? '';
      this.logs.delete(taskId);
      this.finish(task, code, code === 0 ? undefined : '构建没有完成');
      return { ...start, code, log };
    }
    const port = await freePort();
    void this.runAstro(task, siteDir, port).then((code) => this.finish(task, code));
    return start;
  }

  cancel(taskId: string): void {
    const task = this.live.get(taskId);
    if (!task) return;
    killTree(task.child?.pid);
  }

  stopAll(): void {
    for (const task of this.live.values()) {
      this.replaced.add(task.taskId);
      killTree(task.child?.pid);
    }
    this.live.clear();
  }

  private async install(task: LiveTask, siteDir: string): Promise<number> {
    const preferred = storeDirFor(siteDir);
    const store = canUseStore(preferred) ? preferred : path.join(siteDir, '.pnpm-store');
    if (store !== preferred) {
      this.hooks.onLog({
        taskId: task.taskId,
        text: `离线仓库 ${preferred} 写不进去，改用站点里的 .pnpm-store。\n`,
      });
    }
    let useNode = false;
    const run = async (offline: boolean): Promise<number> => {
      // hoisted：Windows 上 pnpm 11 会把依赖做成 \??\Global 联接，Node 不跟随，
      // astro 因此找不到 yargs-parser 并立刻退出。平铺后从站点 node_modules 就能解析。
      const args = installArgs(offline).concat([
        '--ignore-workspace',
        '--config.node-linker=hoisted',
        '--store-dir',
        store,
      ]);
      if (useNode) return this.spawnNodePnpm(task, siteDir, args);
      const code = await this.spawnPnpm(task, siteDir, args);
      if (code === 0) return code;
      const fallback = nodePnpmLauncher();
      if (!fallback) return code;
      useNode = true;
      const locked = this.deniedStoreLock(task.taskId);
      this.hooks.onLog({
        taskId: task.taskId,
        text: locked
          ? '内置 pnpm 打不开本机安装锁（拒绝访问）。改用系统里的 pnpm。\n'
          : '内置 pnpm 安装失败。改用系统里的 pnpm。\n',
      });
      return this.spawnNodePnpm(task, siteDir, args);
    };
    const first = await run(true);
    if (first === 0) {
      this.finish(task, 0);
      return 0;
    }
    this.hooks.onLog({
      taskId: task.taskId,
      text: '离线安装失败。请联网后重试，正在改用优先离线安装。\n',
    });
    const second = await run(false);
    this.finish(task, second, second === 0 ? undefined : '依赖没有装好');
    return second;
  }

  private deniedStoreLock(taskId: string): boolean {
    return (this.logs.get(taskId) ?? '').includes('ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK');
  }

  private spawnPnpm(task: LiveTask, siteDir: string, args: string[]): Promise<number> {
    return this.spawn(task, this.pnpmPath(), args, siteDir, false);
  }

  /** 内置 pnpm.exe 在这台机器上打不开安装锁时，改走本机 Node 版 pnpm。 */
  private spawnNodePnpm(task: LiveTask, siteDir: string, args: string[]): Promise<number> {
    const fallback = nodePnpmLauncher();
    if (!fallback) {
      this.hooks.onLog({
        taskId: task.taskId,
        text: '没有找到系统里的 pnpm，安装停在内置 pnpm 的报错上。\n',
      });
      return Promise.resolve(1);
    }
    const [command, ...rest] = args;
    return this.spawn(
      task,
      fallback.command,
      [fallback.script, command ?? 'install', '--pm-on-fail=ignore', ...rest],
      siteDir,
      false,
    );
  }

  private runAstro(task: LiveTask, siteDir: string, port?: number): Promise<number> {
    const entry = path.join(siteDir, 'node_modules', 'astro', 'bin', 'astro.mjs');
    const shim = this.shimDir();
    const args = [...astroCommand(task.kind, port)];
    const dev = task.kind === 'dev';
    if (dev) {
      // Astro 会把 --config 再拼到站点根目录上，绝对路径会变成不存在的路径。
      const configAbs = app.isPackaged
        ? path.join(process.resourcesPath, 'preview.config.mjs')
        : path.resolve(import.meta.dirname, '../../resources/preview.config.mjs');
      args.push('--config', path.relative(siteDir, configAbs));
    }
    return this.spawn(task, process.execPath, [entry, ...args], siteDir, dev, {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ASTRO_TELEMETRY_DISABLED: '1',
      PATH: `${shim}${path.delimiter}${process.env.PATH ?? ''}`,
      ...(dev ? { XIAO_SITE_DIR: siteDir } : {}),
    });
  }

  private spawn(
    task: LiveTask,
    command: string,
    args: string[],
    cwd: string,
    watchReady: boolean,
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<number> {
    const child = spawn(command, args, { cwd, env, windowsHide: true });
    task.child = child;
    let buffer = '';
    const take = (chunk: Buffer): void => {
      const text = chunk.toString();
      const prev = this.logs.get(task.taskId) ?? '';
      const next = `${prev}${text}`;
      this.logs.set(task.taskId, next.length > 20000 ? next.slice(-20000) : next);
      this.hooks.onLog({ taskId: task.taskId, text });
      if (!watchReady) return;
      buffer += text;
      const url = readyUrl(buffer);
      if (!url) return;
      watchReady = false;
      task.readyUrl = url;
      this.hooks.onReady({ taskId: task.taskId, url });
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    return new Promise((resolve) => {
      child.on('exit', (code) => resolve(code ?? 1));
      child.on('error', () => resolve(1));
    });
  }

  private finish(task: LiveTask, code: number, message?: string): void {
    const replaced = this.replaced.delete(task.taskId);
    this.live.delete(task.taskId);
    this.hooks.onExit({
      taskId: task.taskId,
      code,
      ...(replaced ? { replaced: true } : {}),
      ...(message ? { message } : {}),
    });
  }
}

/** 本机 Node 安装的 pnpm。内置 exe 被安全软件拒绝访问锁文件时用它。 */
function canUseStore(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.xiao-write-probe');
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function nodePnpmLauncher(): { command: string; script: string } | null {
  if (process.platform !== 'win32') return null;
  const found = spawnSync('where.exe', ['pnpm'], { encoding: 'utf8', windowsHide: true });
  if (found.status !== 0) return null;
  for (const line of found.stdout.split(/\r?\n/)) {
    const hit = line.trim();
    if (!hit) continue;
    const dir = path.dirname(hit);
    const script = path.join(dir, 'node_modules', 'pnpm', 'bin', 'pnpm.mjs');
    if (!existsSync(script)) continue;
    const node = path.join(dir, 'node.exe');
    return { command: existsSync(node) ? node : 'node', script };
  }
  return null;
}

export function killTree(pid: number | undefined): void {
  if (!pid || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // 进程已经退出
    }
  }
}

function freePort(start = 4321): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : start;
      server.close(() => resolve(port));
    });
  });
}
