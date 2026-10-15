import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';

interface SpikeArgs {
  site: string;
  cmd: 'dev' | 'build' | 'probe';
  logFile?: string;
  quitFile?: string;
  exitOnDone: boolean;
}

function parseArgs(argv: string[]): SpikeArgs {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      map.set(key, next);
      i += 1;
    } else {
      map.set(key, 'true');
    }
  }
  const site = map.get('site');
  const cmd = map.get('cmd');
  if (!site || (cmd !== 'dev' && cmd !== 'build' && cmd !== 'probe')) {
    throw new Error('用法：--site <站点目录> --cmd dev|build|probe');
  }
  const logFile = map.get('log-file');
  const quitFile = map.get('quit-file');
  return {
    site: path.resolve(site),
    cmd,
    ...(logFile ? { logFile } : {}),
    ...(quitFile ? { quitFile } : {}),
    exitOnDone: map.get('exit-on-done') === 'true',
  };
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function createLogger(logFile: string | undefined): (text: string) => void {
  if (logFile) mkdirSync(path.dirname(logFile), { recursive: true });
  return (text: string) => {
    process.stdout.write(text);
    if (logFile) appendFileSync(logFile, text);
  };
}

function killTree(pid: number | undefined): void {
  if (!pid || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // 进程已经退出
  }
}

function resolveAstroEntry(siteDir: string): string {
  const candidates = [
    path.join(siteDir, 'node_modules', 'astro', 'astro.js'),
    path.join(siteDir, 'node_modules', 'astro', 'bin', 'astro.mjs'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`找不到 Astro 入口：${siteDir}`);
}

function prepareShim(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'shim');
  const dir = path.join(process.cwd(), '.shim');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'node.cmd'),
    `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" %*\r\n`,
  );
  return dir;
}

function childEnv(shimDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ASTRO_TELEMETRY_DISABLED: '1',
    PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ''}`,
  };
}

let child: ChildProcess | undefined;
let cleaned = false;

function cleanup(): void {
  if (cleaned) return;
  cleaned = true;
  killTree(child?.pid);
}

function watchQuitFile(quitFile: string | undefined): void {
  if (!quitFile) return;
  const timer = setInterval(() => {
    if (!existsSync(quitFile)) return;
    clearInterval(timer);
    app.quit();
  }, 300);
}

async function openWindow(url: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL(url);
  return win;
}

function runAstro(args: SpikeArgs, shimDir: string, log: (text: string) => void): Promise<number> {
  const astroEntry = resolveAstroEntry(args.site);
  log(`[spike] astro ${astroEntry}\n`);
  const astroArgs = args.cmd === 'dev' ? ['dev', '--host', '127.0.0.1'] : ['build'];
  child = spawn(process.execPath, [astroEntry, ...astroArgs], {
    cwd: args.site,
    env: childEnv(shimDir),
    windowsHide: true,
  });
  let urlLoaded = false;
  let buffer = '';
  const onData = (chunk: Buffer): void => {
    const text = chunk.toString();
    log(text);
    if (args.cmd !== 'dev' || urlLoaded) return;
    buffer += stripAnsi(text);
    const matched = buffer.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/?/);
    const url = matched?.[0];
    if (!url) return;
    urlLoaded = true;
    log(`[spike] preview ${url}\n`);
    void openWindow(url).catch((error: unknown) => {
      log(`[spike] 打开预览失败 ${String(error)}\n`);
    });
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);
  return new Promise((resolve) => {
    child?.on('exit', (code) => {
      log(`[spike] astro exit ${code ?? 'null'}\n`);
      resolve(code ?? 1);
    });
  });
}

function runProbe(args: SpikeArgs, shimDir: string, log: (text: string) => void): Promise<number> {
  child =
    process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm run probe-node'], {
          cwd: args.site,
          env: childEnv(shimDir),
          windowsHide: true,
        })
      : spawn('pnpm', ['run', 'probe-node'], {
          cwd: args.site,
          env: childEnv(shimDir),
          windowsHide: true,
        });
  child.stdout?.on('data', (chunk: Buffer) => log(chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => log(chunk.toString()));
  return new Promise((resolve) => {
    child?.on('exit', (code) => {
      log(`[spike] probe exit ${code ?? 'null'}\n`);
      resolve(code ?? 1);
    });
  });
}

app.on('before-quit', cleanup);
app.on('will-quit', cleanup);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void app.whenReady().then(async () => {
  let exitCode = 1;
  try {
    const args = parseArgs(process.argv);
    const log = createLogger(args.logFile);
    const shimDir = prepareShim();
    log(
      `[spike] electron=${process.versions.electron} node=${process.versions.node} packaged=${app.isPackaged} exec=${process.execPath}\n`,
    );
    log(`[spike] shim=${shimDir} site=${args.site} cmd=${args.cmd}\n`);
    watchQuitFile(args.quitFile);
    exitCode =
      args.cmd === 'probe'
        ? await runProbe(args, shimDir, log)
        : await runAstro(args, shimDir, log);
    if (args.cmd === 'dev') return;
    if (args.exitOnDone) {
      app.exit(exitCode);
    } else {
      await openWindow(
        `data:text/html;charset=utf-8,${encodeURIComponent(`<p>退出码 ${exitCode}</p>`)}`,
      );
    }
  } catch (error) {
    process.stderr.write(`[spike] ${String(error)}\n`);
    app.exit(1);
  }
});
