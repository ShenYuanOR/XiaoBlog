import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { inspectPage } from '../../core/src/responsive/inspect.mjs';

const css = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/xiao.css'),
  'utf8',
);
const root = path.join(tmpdir(), 'xiao-stress');
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
for (let i = 0; i < 200; i += 1) {
  const dir = path.join(root, String(i));
  mkdirSync(dir);
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div class="x-stack x-dir-column x-gap-md"><div class="x-card"><p>第 ${i} 页的说明文字会换行。</p></div></div></body></html>`,
  );
}

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const name = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/0';
      const file = path.join(dir, name.replace(/^\//, ''), 'index.html');
      try {
        response.end(readFileSync(file));
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

process.on('uncaughtException', (error) => {
  console.error(error);
  app.exit(1);
});

app.whenReady().then(async () => {
  console.log('stress-start');
  const { server, port } = await serve(root);
  const win = new BrowserWindow({
    show: false,
    width: 360,
    height: 900,
    webPreferences: { backgroundThrottling: false, sandbox: true, contextIsolation: true },
  });
  win.webContents.debugger.attach('1.3');
  const failures = [];
  try {
    for (let i = 0; i < 200; i += 1) {
      await win.loadURL(`http://127.0.0.1:${port}/${i}/`);
      if (i === 0) {
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width: 360,
          height: 900,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await win.webContents.debugger.sendCommand('Emulation.setScrollbarsHidden', { hidden: true });
      }
      if (i % 50 === 0) console.log(`stress-${i}`);
      const issues = await win.webContents.executeJavaScript(`(${inspectPage.toString()})()`);
      const errors = issues.filter((issue) => issue.level === 'error');
      if (errors.length > 0) failures.push(`${i}:${errors.map((issue) => issue.rule).join(',')}`);
    }
  } finally {
    server.close();
    win.destroy();
    rmSync(root, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ pages: 200, failures: failures.length }));
  if (failures.length > 0) {
    console.log(failures.slice(0, 5).join('\n'));
    app.exit(1);
    return;
  }
  console.log('STRESS_OK');
  app.exit(0);
});
