import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { app, BrowserWindow, ipcMain, net, protocol } from 'electron';
import { ok } from '@xiao/core/ipc';
import type { AppInfo } from '@xiao/core/ipc';

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

app.whenReady().then(() => {
  registerProtocol();
  ipcMain.handle('app:getInfo', () =>
    ok<AppInfo>({ name: '晓', version: app.getVersion(), packaged: app.isPackaged }),
  );
  const win = createWindow();
  if (process.argv.includes('--probe')) probe(win);
});

app.on('window-all-closed', () => {
  app.quit();
});
