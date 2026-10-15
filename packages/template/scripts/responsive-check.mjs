import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { inspectPage } from '../../core/src/responsive/inspect.mjs';

const templateRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(templateRoot, 'dist');
const widths = [360, 768, 1024, 1280, 1440];

function pagesOf(dir, prefix = '') {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...pagesOf(full, `${prefix}${name}/`));
    else if (name === 'index.html') found.push(prefix);
  }
  return found;
}

function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      let name = decodeURIComponent(url.pathname);
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(root, `.${name}`);
      if (!file.startsWith(root)) {
        response.writeHead(403);
        response.end();
        return;
      }
      try {
        response.end(readFileSync(file));
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

app.whenReady().then(async () => {
  const pages = pagesOf(dist).filter((page) => !page.startsWith('pagefind'));
  const { server, port } = await serve(dist);
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  win.webContents.debugger.attach('1.3');
  const failures = [];
  try {
    for (const page of pages) {
      await win.loadURL(`http://127.0.0.1:${port}/${page}`);
      for (const width of widths) {
        win.setContentSize(width, 900);
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await win.webContents.debugger.sendCommand('Emulation.setScrollbarsHidden', {
          hidden: true,
        });
        const client = await win.webContents.executeJavaScript(
          'document.documentElement.clientWidth',
        );
        if (client !== width) failures.push(`${page} 视口 ${width} 实际 ${client}`);
        const issues = await win.webContents.executeJavaScript(`(${inspectPage.toString()})()`);
        const errors = issues.filter((issue) => issue.level === 'error');
        if (errors.length > 0)
          failures.push(`${page} @${width} ${errors.map((issue) => issue.rule).join(',')}`);
      }
    }
  } finally {
    server.close();
    win.destroy();
  }
  console.log(JSON.stringify({ pages: pages.length, failures }, null, 2));
  if (failures.length > 0) {
    app.exit(1);
    return;
  }
  console.log('TEMPLATE_RESPONSIVE_OK');
  app.exit(0);
});
