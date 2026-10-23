import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { inspectPage } from '../../../packages/core/src/responsive/inspect.mjs';

const widths = [360, 768, 1024, 1280, 1440];
const root = mkdtempSync(path.join(tmpdir(), 'xiao-responsive-'));
writeFileSync(
  path.join(root, 'bad.html'),
  '<!doctype html><meta charset="utf-8"><div id="wide" style="width:2000px;height:40px">溢出</div>',
);
writeFileSync(
  path.join(root, 'good.html'),
  '<!doctype html><meta charset="utf-8"><p id="ok" style="width:120px;height:40px">好</p>',
);

function serve() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const name = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const file = path.resolve(root, `.${name}`);
      if (!file.startsWith(root)) {
        response.writeHead(403);
        response.end();
        return;
      }
      response.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

app.whenReady().then(async () => {
  const { server, port } = await serve();
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  const found = [];
  try {
    win.webContents.debugger.attach('1.3');
    for (const page of ['bad.html', 'good.html']) {
      await win.loadURL(`http://127.0.0.1:${port}/${page}`);
      for (const width of widths) {
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await win.webContents.debugger.sendCommand('Emulation.setScrollbarsHidden', {
          hidden: true,
        });
        const issues = await win.webContents.executeJavaScript(`(${inspectPage.toString()})()`);
        for (const issue of issues) found.push({ page, viewport: width, ...issue });
      }
    }
  } finally {
    server.close();
    win.destroy();
  }
  const bad = found.filter((issue) => issue.page === 'bad.html' && issue.level === 'error');
  const good = found.filter((issue) => issue.page === 'good.html' && issue.level === 'error');
  if (bad.length === 0 || good.length !== 0) {
    console.log(JSON.stringify({ bad: bad.length, good: good.length, sample: found.slice(0, 4) }));
    app.exit(1);
    return;
  }
  console.log('RESPONSIVE_FIXTURE_OK');
  app.exit(0);
});
