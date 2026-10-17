import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, writeFileSync } from 'node:fs';
import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import { fail, ok } from '@xiao/core/ipc';
import type { AppInfo, RuntimeKind } from '@xiao/core/ipc';
import { RuntimeService } from './runtime.ts';
import {
  createSite,
  openPreview,
  pickDirectory,
  readRecent,
  remember,
  siteTitle,
} from './project.ts';
import { SiteWatcher } from './watch.ts';
const csp = [
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function rendererFile(pathname: string): string {
  const name = pathname === '/' ? '/index.html' : pathname;
  return join(import.meta.dirname, '../renderer', decodeURIComponent(name));
}

function registerProtocol(): void {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    return net.fetch(pathToFileURL(rendererFile(url.pathname)).href).then((response) => {
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', csp);
      return new Response(response.body, { status: response.status, headers });
    });
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !process.argv.includes('--probe'),
    title: '晓',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (app.isPackaged) {
    void win.loadURL('app://bundle/index.html');
  } else {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL ?? 'app://bundle/index.html');
  }
  return win;
}

function probe(win: BrowserWindow): void {
  const file = process.env.XIAO_PROBE_FILE;
  if (!file) return;
  const violations: string[] = [];
  win.webContents.on('console-message', (event) => {
    violations.push(event.message);
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    violations.push(`preload ${preloadPath} ${error.message}`);
  });
  win.webContents.on('did-finish-load', () => {
    void win.webContents
      .executeJavaScript(
        `Promise.resolve(window.xiao?.app?.getInfo?.() ?? { missing: true }).then((info) => ({ protocol: location.protocol, info, csp: window.__csp ?? [] }))`,
      )
      .then((result: { protocol: string; info: unknown; csp: string[] }) => {
        writeFileSync(
          file,
          JSON.stringify({ ...result, consoleCsp: violations, protocolHeader: csp }),
        );
        app.quit();
      })
      .catch((error: unknown) => {
        writeFileSync(file, JSON.stringify({ error: String(error), consoleCsp: violations }));
        app.exit(1);
      });
  });
}

let watcher: SiteWatcher | undefined;

function send(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((item) => item.webContents.send(channel, payload));
}

function watchSite(dir: string): void {
  watcher?.stop();
  watcher = new SiteWatcher(dir, {
    onReload: (event) => send('project:onReload', event),
    onConflict: (event) => send('project:onConflict', event),
  });
  watcher.start();
}

const runtime = new RuntimeService({
  onStart: (event) =>
    BrowserWindow.getAllWindows().forEach((item) =>
      item.webContents.send('runtime:onStart', event),
    ),
  onLog: (event) =>
    BrowserWindow.getAllWindows().forEach((item) => item.webContents.send('runtime:onLog', event)),
  onReady: (event) => {
    BrowserWindow.getAllWindows().forEach((item) =>
      item.webContents.send('runtime:onReady', event),
    );
    openPreview(event.url);
  },
  onExit: (event) =>
    BrowserWindow.getAllWindows().forEach((item) => item.webContents.send('runtime:onExit', event)),
});

app.whenReady().then(() => {
  registerProtocol();
  ipcMain.handle('app:getInfo', () =>
    ok<AppInfo>({ name: '晓', version: app.getVersion(), packaged: app.isPackaged }),
  );
  ipcMain.handle('runtime:start', (_event, kind: RuntimeKind, siteDir: string) => {
    if (kind !== 'install' && kind !== 'dev' && kind !== 'build') {
      return fail('RUNTIME_KIND', '不认识的运行命令');
    }
    if (!siteDir) return fail('RUNTIME_SITE', '还没有选择站点');
    return runtime.start(kind, siteDir).then((task) => ok(task));
  });
  ipcMain.handle('runtime:cancel', (_event, taskId: string) => {
    runtime.cancel(taskId);
    return ok(null);
  });
  ipcMain.handle('project:recent', () => ok(readRecent()));
  ipcMain.handle('project:pick', async () => ok(await pickDirectory()));
  ipcMain.handle(
    'project:create',
    async (_event, parent: string, title: string, author: string) => {
      if (!parent || !title?.trim()) return fail('PROJECT_INPUT', '请选择目录并填写站点名');
      try {
        const site = await createSite(runtime, parent, title.trim(), author ?? '');
        watchSite(site.dir);
        return ok(site);
      } catch (error) {
        return fail('PROJECT_CREATE', error instanceof Error ? error.message : '新建失败');
      }
    },
  );
  ipcMain.handle('project:open', async (_event, dir?: string) => {
    const picked = dir ?? (await pickDirectory());
    if (!picked) return ok(null);
    if (!existsSync(join(picked, 'xiao.config.json'))) {
      return fail('PROJECT_OPEN', '这个文件夹不是晓的站点');
    }
    const title = siteTitle(picked);
    remember(picked, title);
    watchSite(picked);
    await runtime.start('dev', picked);
    return ok({ dir: picked, title });
  });
  ipcMain.handle('project:markDirty', (_event, file: string, content: string) => {
    watcher?.markDirty(file, content);
    return ok(null);
  });
  ipcMain.handle('project:noteWrite', (_event, file: string, content: string) => {
    watcher?.noteWrite(file, content);
    return ok(null);
  });
  ipcMain.handle('project:resolve', (_event, file: string, action: 'keep' | 'load') => {
    const loaded = watcher?.resolve(file, action);
    return ok(loaded ?? null);
  });
  const win = createWindow();
  if (process.argv.includes('--probe')) probe(win);
});

app.on('before-quit', () => {
  runtime.stopAll();
  watcher?.stop();
});

app.on('window-all-closed', () => {
  app.quit();
});
