import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, screen } from 'electron';
import { inspectPage } from '../../packages/core/src/responsive/inspect.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(root, 'fixtures', 'responsive');
const widths = [360, 768, 1024, 1280, 1440];
const broken = {
  overflow: 'page-overflow',
  'long-word': 'page-overflow',
  overlap: 'overlap',
  'fixed-image': 'page-overflow',
  clip: 'text-clip',
  tiny: 'tap-target',
};
const normal = ['ok-article', 'ok-note', 'ok-nav'];

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const name = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/').replace(
        /^\/+/,
        '',
      );
      const file = path.resolve(dir, name);
      const relative = path.relative(dir, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(403);
        response.end();
        return;
      }
      try {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(readFileSync(file));
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

function signature(issues) {
  return issues
    .map((issue) => `${issue.level}:${issue.rule}:${issue.selector}`)
    .sort()
    .join('|');
}

app.whenReady().then(async () => {
  const { server, port } = await serve(fixtureDir);
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    minWidth: 200,
    minHeight: 200,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const failures = [];
  const timings = [];
  try {
    win.webContents.debugger.attach('1.3');
    const pages = [...Object.keys(broken), ...normal];
    for (const name of pages) {
      await win.loadURL(`http://127.0.0.1:${port}/${name}.html`);
      const byScale = {};
      for (const scale of [1, 1.5]) {
        const started = Date.now();
        const found = [];
        for (const width of widths) {
          win.setContentSize(width, 900);
          await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
            width,
            height: 900,
            deviceScaleFactor: scale,
            mobile: width < 768,
          });
          await win.webContents.debugger.sendCommand('Emulation.setScrollbarsHidden', {
            hidden: true,
          });
          const client = await win.webContents.executeJavaScript(
            'document.documentElement.clientWidth',
          );
          if (client !== width) failures.push(`${name} 视口 ${width} 实际 ${client}`);
          const issues = await win.webContents.executeJavaScript(`(${inspectPage.toString()})()`);
          found.push(...issues.map((issue) => ({ ...issue, width })));
        }
        byScale[String(scale)] = found;
        if (scale === 1) timings.push({ name, ms: Date.now() - started });
      }
      if (signature(byScale['1']) !== signature(byScale['1.5'])) {
        failures.push(`${name} 在 150% 缩放下结果不一致`);
      }
      const rules = new Set(byScale['1'].map((issue) => issue.rule));
      const errors = byScale['1'].filter((issue) => issue.level === 'error');
      if (name in broken) {
        if (!rules.has(broken[name])) failures.push(`${name} 没有检出 ${broken[name]}`);
      } else if (errors.length > 0) {
        failures.push(`${name} 有 error：${errors.map((issue) => issue.rule).join(',')}`);
      }
    }
  } finally {
    server.close();
    win.destroy();
  }
  const display = screen.getPrimaryDisplay();
  console.log(
    JSON.stringify(
      {
        display: {
          width: display.size.width,
          height: display.size.height,
          scaleFactor: display.scaleFactor,
        },
        timings,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) {
    app.exit(1);
    return;
  }
  console.log('RESPONSIVE_OK');
  app.exit(0);
});
