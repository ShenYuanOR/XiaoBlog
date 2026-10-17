import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  child?: ChildProcess;
}

export class RuntimeService {
  private live = new Map<string, LiveTask>();

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

  async start(kind: RuntimeKind, siteDir: string): Promise<RuntimeStart & { code?: number }> {
    this.stopAll();
    const taskId = randomUUID();
    const task: LiveTask = { taskId, kind };
    this.live.set(taskId, task);
    const start = { taskId, kind };
    this.hooks.onStart(start);
    if (kind === 'install') {
      const code = await this.install(task, siteDir);
      return { ...start, code };
    }
    const port = kind === 'dev' ? await freePort() : undefined;
    this.spawnAstro(task, siteDir, port);
    return start;
  }

  cancel(taskId: string): void {
    const task = this.live.get(taskId);
    if (!task) return;
    killTree(task.child?.pid);
  }

  stopAll(): void {
    for (const task of this.live.values()) killTree(task.child?.pid);
    this.live.clear();
  }

  private async install(task: LiveTask, siteDir: string): Promise<number> {
    const store = storeDirFor(siteDir);
    const first = await this.spawnPnpm(
      task,
      siteDir,
      installArgs(true).concat(['--store-dir', store]),
    );
    if (first === 0) {
      this.finish(task, 0);
      return 0;
    }
    this.hooks.onLog({
      taskId: task.taskId,
      text: '离线安装失败。请联网后重试，正在改用优先离线安装。\n',
    });
    const second = await this.spawnPnpm(
      task,
      siteDir,
      installArgs(false).concat(['--store-dir', store]),
    );
    this.finish(task, second, second === 0 ? undefined : '依赖没有装好');
    return second;
  }

  private spawnPnpm(task: LiveTask, siteDir: string, args: string[]): Promise<number> {
    return this.spawn(task, this.pnpmPath(), args, siteDir, false);
  }

  private spawnAstro(task: LiveTask, siteDir: string, port?: number): void {
    const entry = path.join(siteDir, 'node_modules', 'astro', 'bin', 'astro.mjs');
    const shim = this.shimDir();
    const args = [...astroCommand(task.kind, port)];
    const dev = task.kind === 'dev';
    if (dev) {
      const config = app.isPackaged
        ? path.join(process.resourcesPath, 'preview.config.mjs')
        : path.join(process.cwd(), 'resources', 'preview.config.mjs');
      args.push('--config', config);
    }
    void this.spawn(task, process.execPath, [entry, ...args], siteDir, dev, {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ASTRO_TELEMETRY_DISABLED: '1',
      PATH: `${shim}${path.delimiter}${process.env.PATH ?? ''}`,
      ...(dev ? { XIAO_SITE_DIR: siteDir } : {}),
    }).then((code) => this.finish(task, code));
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
      this.hooks.onLog({ taskId: task.taskId, text });
      if (!watchReady) return;
      buffer += text;
      const url = readyUrl(buffer);
      if (!url) return;
      watchReady = false;
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
    this.live.delete(task.taskId);
    this.hooks.onExit({ taskId: task.taskId, code, ...(message ? { message } : {}) });
  }
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
