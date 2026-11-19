import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  protocol,
  safeStorage,
  session,
  shell,
} from 'electron';
import { fail, ok } from '@xiao/core/ipc';
import type { AppInfo, RuntimeKind } from '@xiao/core/ipc';
import { RuntimeService } from './runtime.ts';
import { createSite, pickDirectory, readRecent, remember, siteTitle } from './project.ts';
import {
  focusPreview,
  focusSelector,
  isPreviewContents,
  isPreviewFrameSender,
  applyPreviewMode,
  destroyDock,
  hideDock,
  hidePageEditor,
  expectPreviewUrl,
  installPreviewNavigationLock,
  reloadPreviewDocuments,
  isPreviewWindowOpen,
  hitPreview,
  hintDrop,
  setDockZoom,
  showDock,
  showPageEditor,
  showPreview,
  rememberCatalog,
  type PreviewMode,
  type DockInput,
  type StageHit,
} from './preview.ts';
import { SiteWatcher } from './watch.ts';
import {
  createDeployStore,
  createNetHttpClient,
  probeRemote,
  pushSite,
  remoteDefaultBranch,
  repairRepository,
  type DeployTarget,
} from './publish.ts';
import { readPageStyle, resetPageStyle, writePageStyle } from './page-style.ts';
import {
  createPost,
  customizePost,
  deletePost,
  listPosts,
  readLayoutComparison,
  readPostFile,
  renamePost,
  resetPostLayout,
  saveImage,
  writePostFile,
} from './content.ts';
import {
  deleteMedia,
  listMedia,
  renameMedia,
  resolveMediaAsset,
  resolvePostImage,
  uploadMedia,
  type MediaUploadInput,
} from './media.ts';
import { patchConfig, readConfig, readManifest, type SettingsPatch } from './settings.ts';
import { seoRows } from './seo.ts';
import {
  duplicateComponent,
  insertComponent,
  moveComponent,
  nestingAllowed,
  removeComponent,
  readOutline,
  redoPage,
  safePage,
  setComponentProp,
  setPageText,
  setVisualText,
  undoPage,
  wrapComponent,
} from './canvas.ts';
import { createPage, listPages, pageHref, type PageTemplate } from './pages.ts';
import { readArticleCss } from './article-css.ts';
import { listSections, saveSection, usageCounts } from './sections.ts';
import { lintSource, listSourceFiles, readSource, writeSource } from './develop.ts';
import { writeDeployFiles } from './deploy-files.ts';
import { collectChanges } from './publish-changes.ts';
import { buildPreflight } from './publish-preflight.ts';
import { probeGiteaActions, writeDeployWorkflow } from './publish-workflow.ts';
import { rememberDeploy, type DeployRecord } from './release-gate.ts';
import { GitHubService } from './github.ts';
import { redactSecrets, SecretService } from './secret.ts';
import { manifest } from '@xiao/core/components';
import { layoutSpecs } from '@xiao/core/components/layouts';

const csp = [
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
].join('; ');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'xiao-asset',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
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
  protocol.handle('xiao-asset', (request) => {
    const url = new URL(request.url);
    const siteDir = url.searchParams.get('site') ?? '';
    // 媒体库缩略图：xiao-asset://media/?site=<siteDir>&path=<站点相对路径>
    // media.ts 里做了「站点内 + 图片扩展名 + 无 ..」校验，防止目录穿越。
    const mediaPath = url.searchParams.get('path');
    if (mediaPath !== null) {
      const asset = resolveMediaAsset(siteDir, mediaPath);
      if (!asset) return new Response(null, { status: 404 });
      return net.fetch(pathToFileURL(asset.file).href).then((response) => {
        const headers = new Headers(response.headers);
        headers.set('Content-Type', asset.mime);
        headers.set('Cache-Control', 'no-store');
        return new Response(response.body, { status: response.status, headers });
      });
    }
    // 兼容 Markdown 编辑器里的文章内图片：?site=&slug=&name=
    const slug = url.searchParams.get('slug') ?? '';
    let name = url.pathname.split('/').pop() ?? '';
    try {
      name = decodeURIComponent(name);
    } catch {
      // 名字不是合法编码时保留原样，交给下面的校验拒掉。
    }
    const legacy = resolvePostImage(siteDir, slug, name);
    if (!legacy) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(legacy.file).href);
  });
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    return net.fetch(pathToFileURL(rendererFile(url.pathname)).href).then((response) => {
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', csp);
      return new Response(response.body, { status: response.status, headers });
    });
  });
}

function rendererLoadUrl(): string {
  if (app.isPackaged) return 'app://bundle/index.html';
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || process.env.DEV_PORT || '');
  // PORT 是本进程 Vite 绑定端口。ELECTRON_RENDERER_URL 可能从别的项目泄漏进来。
  if (port > 0) return `http://${host}:${port}`;
  return process.env.ELECTRON_RENDERER_URL ?? 'app://bundle/index.html';
}

const TITLE_BAR_HEIGHT = 47;

function titleBarOverlay(input: { color?: string; symbolColor?: string; height?: number }): {
  color: string;
  symbolColor: string;
  height: number;
} {
  const hex = (value: string | undefined, fallback: string) =>
    value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  return {
    color: hex(input.color, '#131822'),
    symbolColor: hex(input.symbolColor, '#e8ecf4'),
    height: TITLE_BAR_HEIGHT,
  };
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: !process.argv.includes('--probe'),
    title: '晓',
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlay({}),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // 预览 iframe 里的 preload 要能把点击事件送回主进程。
      nodeIntegrationInSubFrames: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  installPreviewNavigationLock(win);
  const url = rendererLoadUrl();
  if (!app.isPackaged && url.startsWith('http') && !process.argv.includes('--probe')) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  }
  void win.loadURL(url);
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
let secretService: SecretService | undefined;

function secretStore(): SecretService {
  if (!secretService) {
    secretService = new SecretService(join(app.getPath('userData'), 'secrets.json'), {
      encrypt(plain: string): string {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('这台电脑不能加密 Token');
        return safeStorage.encryptString(plain).toString('base64');
      },
      decrypt(stored: string): string {
        return safeStorage.decryptString(Buffer.from(stored, 'base64'));
      },
    });
  }
  return secretService;
}

const github = new GitHubService(async (url, init) => {
  const response = await net.fetch(url, { headers: init.headers });
  return { status: response.status, body: await response.text() };
});

// 发布走 net.fetch → 系统代理，再交给 isomorphic-git；用户不需要另装 git。
const publishHttp = createNetHttpClient(async (url, init) => {
  const response = await net.fetch(url, {
    method: init.method,
    headers: init.headers,
    ...(init.body ? { body: init.body as unknown as BodyInit } : {}),
  });
  return {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    body: new Uint8Array(await response.arrayBuffer()),
  };
});

let deployStoreInstance: ReturnType<typeof createDeployStore> | undefined;

function deployStore(): ReturnType<typeof createDeployStore> {
  // 单例：用户目录不可写时会退化成内存存储，必须复用同一个实例。
  deployStoreInstance ??= createDeployStore(join(app.getPath('userData'), 'deploy-targets.json'));
  return deployStoreInstance;
}

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
    BrowserWindow.getAllWindows().forEach((item) => {
      item.webContents.send('runtime:onReady', event);
    });
  },
  onExit: (event) =>
    BrowserWindow.getAllWindows().forEach((item) => item.webContents.send('runtime:onExit', event)),
});

function historyFile(): string {
  return join(app.getPath('userData'), 'deploy-history.json');
}

function readDeployHistory(siteDir: string): DeployRecord[] {
  try {
    const all = JSON.parse(readFileSync(historyFile(), 'utf8')) as Record<string, DeployRecord[]>;
    return all[siteDir] ?? [];
  } catch {
    return [];
  }
}

function writeDeployHistory(siteDir: string, rows: DeployRecord[]): void {
  const file = historyFile();
  let all: Record<string, DeployRecord[]> = {};
  try {
    all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, DeployRecord[]>;
  } catch {
    all = {};
  }
  all[siteDir] = rows;
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(file, `${JSON.stringify(all)}\n`);
  } catch (error) {
    // 部署历史是附属记录，写不进去不能影响推送结果本身。
    console.warn(`记录部署历史失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

if (!app.isPackaged) {
  const port = process.env.XIAO_CDP_PORT || '9222';
  app.commandLine.appendSwitch('remote-debugging-port', port);
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

function fromPreview(event: {
  sender: Electron.WebContents;
  senderFrame: { name: string } | null;
}): boolean {
  return isPreviewContents(event.sender) || isPreviewFrameSender(event.senderFrame);
}

function readableBuildError(log: string): string {
  const plain = log.replace(/\u001b\[[0-9;]*m/g, '');
  const lines = plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[├└]/.test(line) && !/^\s*at\s/.test(line));
  const cause = lines.filter(
    (line) =>
      /文章 |frontmatter|不合法|死链|slug /i.test(line) && !/unhandled error occurred/i.test(line),
  );
  if (cause.length > 0) return cause.slice(-8).join('\n');
  const fallback = lines.filter((line) => !/unhandled error occurred/i.test(line));
  return fallback.slice(-6).join('\n') || '构建没有完成';
}

app.whenReady().then(() => {
  // 全局去掉 File/Edit/View/Window。只对主窗口 setMenu 的话，以后新建的窗口还会冒出来。
  Menu.setApplicationMenu(null);
  session.defaultSession.registerPreloadScript({
    type: 'frame',
    id: 'xiao-preview',
    filePath: join(import.meta.dirname, '../preload/preview.js'),
  });
  registerProtocol();
  ipcMain.handle('app:getInfo', () =>
    ok<AppInfo>({ name: '晓', version: app.getVersion(), packaged: app.isPackaged }),
  );
  ipcMain.handle(
    'app:titleBarOverlay',
    (event, input: { color?: string; symbolColor?: string; height?: number }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return fail('WINDOW', '找不到主窗口');
      win.setTitleBarOverlay(titleBarOverlay(input ?? {}));
      return ok(null);
    },
  );
  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (!/^https?:\/\//i.test(url)) return fail('OPEN_URL', '只允许打开 http(s) 链接');
    try {
      await shell.openExternal(url);
      return ok(null);
    } catch (error) {
      return fail('OPEN_URL', error instanceof Error ? error.message : '打不开链接');
    }
  });
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
  ipcMain.on('preview:chrome-mode', (_event, mode: PreviewMode) => {
    if (
      mode !== 'phone' &&
      mode !== 'tablet' &&
      mode !== 'pc' &&
      mode !== 'side' &&
      mode !== 'custom'
    ) {
      return;
    }
    void applyPreviewMode(mode);
  });
  ipcMain.handle(
    'preview:set',
    async (event, mode: PreviewMode, url: string, customWidth?: number) => {
      if (!url) return fail('PREVIEW', '还没有预览地址');
      const widths = await showPreview(url, mode, customWidth);
      return ok(widths);
    },
  );
  ipcMain.handle('preview:windowOpen', () => ok(isPreviewWindowOpen()));
  ipcMain.handle(
    'preview:editor',
    (
      event,
      url: string,
      bounds: { x: number; y: number; width: number; height: number } | null,
      interactive = false,
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !url || !bounds) {
        hidePageEditor();
        return ok(null);
      }
      showPageEditor(win, url, bounds, interactive);
      return ok(null);
    },
  );
  ipcMain.handle('preview:dock', async (event, input: DockInput) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return fail('PREVIEW', '找不到主窗口');
    await showDock(win, input);
    return ok(null);
  });
  ipcMain.handle('preview:hideDock', () => {
    hideDock();
    return ok(null);
  });
  ipcMain.handle('preview:expect', (_event, name: string, url: string) => {
    expectPreviewUrl(name, url);
    return ok(null);
  });
  ipcMain.handle('preview:reload', () => {
    reloadPreviewDocuments();
    return ok(null);
  });
  ipcMain.handle('page:href', (_event, siteDir: string, file: string) =>
    ok(pageHref(siteDir, file)),
  );
  ipcMain.on('preview:text', (event, payload: { file: string; offset: string; text: string }) => {
    if (!fromPreview(event)) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents !== event.sender) win.webContents.send('preview:onText', payload);
    }
  });
  ipcMain.on('preview:catalog', (_event, items: { name: string; label: string }[]) => {
    rememberCatalog(Array.isArray(items) ? items : []);
  });
  ipcMain.on(
    'preview:insertBlock',
    (
      event,
      payload: { file: string; offset: string; name: string; place: 'before' | 'after' | 'into' },
    ) => {
      if (!fromPreview(event)) return;
      for (const win of BrowserWindow.getAllWindows()) {
        if (win.webContents !== event.sender)
          win.webContents.send('preview:onInsertBlock', payload);
      }
    },
  );
  ipcMain.on('preview:pick', (event, payload: { file: string; offset: string }) => {
    if (!fromPreview(event)) return;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('preview:onPick', payload);
    }
  });
  ipcMain.handle(
    'preview:focus',
    (
      _event,
      file: string,
      offset: string,
      label?: string,
      handles?: { width?: boolean; pad?: boolean },
    ) => {
      focusPreview(file ?? '', offset ?? '', typeof label === 'string' ? label : '', handles);
      return ok(null);
    },
  );
  ipcMain.handle('preview:hit', async (_event, x: number, y: number) => ok(await hitPreview(x, y)));
  ipcMain.handle('preview:drop', (_event, hit: StageHit | null) => {
    hintDrop(hit);
    return ok(null);
  });
  ipcMain.handle('preview:zoom', (_event, zoom: number) => {
    setDockZoom(Number(zoom) || 1);
    return ok(null);
  });
  ipcMain.on('preview:resize', (event, payload: { prop: 'width' | 'pad'; px: number }) => {
    if (!fromPreview(event)) return;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('preview:onResize', payload);
    }
  });
  ipcMain.on('preview:camera', (event, payload: { zoom: number }) => {
    if (!fromPreview(event)) return;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('preview:onCamera', payload);
    }
  });
  ipcMain.handle('preview:focusSelector', async (_event, selector: string) => {
    await focusSelector(selector);
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
  ipcMain.handle('settings:read', (_event, siteDir: string) => {
    try {
      return ok(readConfig(siteDir));
    } catch (error) {
      return fail('SETTINGS_READ', error instanceof Error ? error.message : '读不到配置');
    }
  });
  ipcMain.handle('settings:patch', (_event, siteDir: string, patch: SettingsPatch) => {
    try {
      return ok(patchConfig(siteDir, patch ?? {}));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      const message = error instanceof Error ? error.message : '写不了配置';
      console.error(`settings:patch ${code || 'ERR'} ${message}`);
      if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') {
        return fail(
          'SETTINGS_WRITE',
          `配置文件写不进去（${code}）。文件可能是只读的，或被安全软件锁住了。解除占用后再保存。`,
        );
      }
      return fail('SETTINGS_WRITE', message);
    }
  });
  ipcMain.handle('theme:read', (_event, siteDir: string) => {
    try {
      return ok(readManifest(siteDir));
    } catch (error) {
      return fail('THEME_READ', error instanceof Error ? error.message : '读不到主题声明');
    }
  });
  ipcMain.handle('canvas:components', () => ok(manifest.map((item) => item.name)));
  ipcMain.handle('canvas:outline', (_event, siteDir: string, file?: string) => {
    try {
      return ok(readOutline(siteDir, safePage(file)));
    } catch (error) {
      return fail('CANVAS_READ', error instanceof Error ? error.message : '读不到页面');
    }
  });
  ipcMain.handle(
    'canvas:insert',
    (_event, siteDir: string, parentId: string, index: number, name: string, file?: string) => {
      try {
        insertComponent(siteDir, parentId, index, name, safePage(file));
        return ok(null);
      } catch (error) {
        return fail('CANVAS_INSERT', error instanceof Error ? error.message : '放不进去');
      }
    },
  );
  ipcMain.handle(
    'canvas:move',
    (_event, siteDir: string, nodeId: string, parentId: string, index: number, file?: string) => {
      try {
        moveComponent(siteDir, nodeId, parentId, index, safePage(file));
        return ok(null);
      } catch (error) {
        return fail('CANVAS_MOVE', error instanceof Error ? error.message : '移不动');
      }
    },
  );
  ipcMain.handle(
    'canvas:wrap',
    (_event, siteDir: string, nodeId: string, wrapperSnippet: string, file?: string) => {
      try {
        wrapComponent(siteDir, nodeId, wrapperSnippet, safePage(file));
        return ok(null);
      } catch (error) {
        return fail('CANVAS_WRAP', error instanceof Error ? error.message : '套不进去');
      }
    },
  );
  ipcMain.handle('canvas:remove', (_event, siteDir: string, nodeId: string, file?: string) => {
    try {
      removeComponent(siteDir, nodeId, safePage(file));
      return ok(null);
    } catch (error) {
      return fail('CANVAS_REMOVE', error instanceof Error ? error.message : '删不掉');
    }
  });
  ipcMain.handle('canvas:duplicate', (_event, siteDir: string, nodeId: string, file?: string) => {
    try {
      duplicateComponent(siteDir, nodeId, safePage(file));
      return ok(null);
    } catch (error) {
      return fail('CANVAS_DUPLICATE', error instanceof Error ? error.message : '复制不了');
    }
  });
  ipcMain.handle('canvas:canNest', (_event, parentName: string, childName: string) =>
    ok(nestingAllowed(parentName, childName)),
  );
  ipcMain.handle('canvas:undo', (_event, siteDir: string, file?: string) => {
    try {
      undoPage(siteDir, safePage(file));
      return ok(null);
    } catch (error) {
      return fail('CANVAS_UNDO', error instanceof Error ? error.message : '撤销失败');
    }
  });
  ipcMain.handle('canvas:redo', (_event, siteDir: string, file?: string) => {
    try {
      redoPage(siteDir, safePage(file));
      return ok(null);
    } catch (error) {
      return fail('CANVAS_REDO', error instanceof Error ? error.message : '重做失败');
    }
  });
  ipcMain.handle('publish:changes', (_event, siteDir: string) => ok(collectChanges(siteDir)));
  ipcMain.handle('publish:history', (_event, siteDir: string) => ok(readDeployHistory(siteDir)));
  ipcMain.handle('publish:target', (_event, siteDir: string) => {
    const target = deployStore().read()[siteDir] ?? null;
    return ok(target);
  });
  ipcMain.handle(
    'publish:connect',
    async (
      _event,
      siteDir: string,
      provider: 'gitea' | 'github',
      remoteUrl: string,
      login: string,
      token: string,
      siteUrl?: string,
    ) => {
      const url = remoteUrl.trim().replace(/\/$/, '');
      if (!/^https?:\/\//.test(url)) {
        return fail('PUBLISH_URL', '仓库地址要以 http:// 或 https:// 开头');
      }
      if (!token.trim()) return fail('PUBLISH_TOKEN', '先填访问令牌');
      const probe = await probeRemote(url, login.trim(), token.trim(), publishHttp);
      if (!probe.ok) return fail('PUBLISH_PROBE', probe.message);
      const branch = await remoteDefaultBranch(url, login.trim(), token.trim(), publishHttp);
      const actions =
        provider === 'gitea'
          ? await probeGiteaActions(url, token.trim())
          : { state: 'unknown' as const, detail: 'GitHub 下一步再接。' };
      const workflow = provider === 'gitea' ? writeDeployWorkflow(siteDir, branch) : 'kept';
      const target: DeployTarget = {
        provider,
        remoteUrl: url,
        branch,
        ...(login.trim() ? { login: login.trim() } : {}),
        ...(siteUrl?.trim() ? { siteUrl: siteUrl.trim() } : {}),
        actionsState: actions.state,
        actionsDetail:
          workflow === 'written' ? `${actions.detail} 构建配置已写入站点。` : actions.detail,
      };
      secretStore().save(siteDir, token.trim(), '');
      const all = deployStore().read();
      all[siteDir] = target;
      deployStore().write(all);
      return ok({
        ...target,
        persisted: secretStore().persisted(siteDir) && deployStore().persisted(),
      });
    },
  );
  ipcMain.handle('publish:push', async (_event, siteDir: string, force?: boolean) => {
    const target = deployStore().read()[siteDir];
    if (!target) return fail('PUBLISH_TARGET', '还没有连接仓库，先填地址和令牌');
    const token = secretStore().load(siteDir);
    if (!token) return fail('PUBLISH_TOKEN', '令牌丢了，重新填一次');
    try {
      const result = await pushSite({
        siteDir,
        target,
        token,
        login: target.login,
        http: publishHttp,
        force: Boolean(force),
      });
      return ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '推送失败';
      if (message.startsWith('REPO_BROKEN:')) {
        return fail('REPO_BROKEN', message.slice('REPO_BROKEN:'.length));
      }
      return fail('PUBLISH_PUSH', redactSecrets(message, [token]));
    }
  });
  ipcMain.handle('publish:repair', async (_event, siteDir: string) => {
    try {
      const result = await repairRepository(siteDir);
      return ok(result);
    } catch (error) {
      return fail('PUBLISH_REPAIR', error instanceof Error ? error.message : '修复仓库失败');
    }
  });
  ipcMain.handle('publish:setSiteUrl', (_event, siteDir: string, siteUrl: string) => {
    const all = deployStore().read();
    const current = all[siteDir];
    if (!current) return fail('PUBLISH_TARGET', '还没有连接仓库');
    const next = siteUrl.trim();
    if (next && !/^https?:\/\//i.test(next)) return fail('PUBLISH_URL', '站点网址要以 http:// 或 https:// 开头');
    current.siteUrl = next;
    all[siteDir] = current;
    deployStore().write(all);
    return ok(current);
  });
  ipcMain.handle('publish:disconnect', (_event, siteDir: string) => {
    const all = deployStore().read();
    delete all[siteDir];
    deployStore().write(all);
    secretStore().remove(siteDir);
    return ok(null);
  });
  ipcMain.handle('publish:record', (_event, siteDir: string, repo: string) => {
    const next = rememberDeploy(readDeployHistory(siteDir), {
      at: new Date().toISOString(),
      repo,
    });
    writeDeployHistory(siteDir, next);
    return ok(next);
  });
  ipcMain.handle(
    'wizard:write',
    (_event, siteDir: string, owner: string, repo: string, branch: string) => {
      try {
        const url =
          repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
            ? `https://${owner}.github.io`
            : `https://${owner}.github.io/${repo}`;
        writeDeployFiles(siteDir, { owner, repo, branch, url });
        return ok(null);
      } catch (error) {
        return fail('WIZARD_WRITE', error instanceof Error ? error.message : '写不了配置');
      }
    },
  );
  ipcMain.handle('secret:save', (_event, repo: string, token: string, expires: string) => {
    try {
      secretStore().save(repo, token, expires);
      return ok(null);
    } catch (error) {
      return fail('SECRET_SAVE', error instanceof Error ? error.message : '存不了 Token');
    }
  });
  ipcMain.handle('secret:list', () => ok(secretStore().list()));
  ipcMain.handle('secret:remove', (_event, repo: string) => {
    secretStore().remove(repo);
    return ok(null);
  });
  ipcMain.handle('github:repo', async (_event, owner: string, name: string) => {
    const token = secretStore().load(`${owner}/${name}`);
    if (!token) return fail('GITHUB_TOKEN', '还没有 Token');
    try {
      const response = await github.repo(owner, name, token);
      return ok({ status: response.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : '请求失败';
      return fail('GITHUB', redactSecrets(message, [token]));
    }
  });
  ipcMain.handle('dev:files', (_event, siteDir: string) => {
    try {
      return ok(listSourceFiles(siteDir));
    } catch (error) {
      return fail('DEV_FILES', error instanceof Error ? error.message : '读不到文件');
    }
  });
  ipcMain.handle('dev:read', (_event, siteDir: string, file: string) => {
    try {
      return ok(readSource(siteDir, file));
    } catch (error) {
      return fail('DEV_READ', error instanceof Error ? error.message : '读不到文件');
    }
  });
  ipcMain.handle('dev:write', (_event, siteDir: string, file: string, content: string) => {
    try {
      const full = writeSource(siteDir, file, content);
      watcher?.noteWrite(full, content);
      return ok(null);
    } catch (error) {
      return fail('DEV_WRITE', error instanceof Error ? error.message : '写不了文件');
    }
  });
  ipcMain.handle('dev:lint', async (_event, siteDir: string, file: string) => {
    try {
      return ok(await lintSource(siteDir, file));
    } catch (error) {
      return fail('DEV_LINT', error instanceof Error ? error.message : '检查失败');
    }
  });
  ipcMain.handle('page:list', (_event, siteDir: string) => {
    try {
      return ok(listPages(siteDir));
    } catch (error) {
      return fail('PAGE_LIST', error instanceof Error ? error.message : '读不到页面');
    }
  });
  ipcMain.handle('page:create', (_event, siteDir: string, template: PageTemplate, slug: string) => {
    try {
      return ok(createPage(siteDir, template, slug));
    } catch (error) {
      return fail('PAGE_CREATE', error instanceof Error ? error.message : '建不了页面');
    }
  });
  ipcMain.handle('page:styleRead', (_event, siteDir: string, slug: string) => {
    try {
      return ok(readPageStyle(siteDir, slug));
    } catch (error) {
      return fail('PAGE_STYLE', error instanceof Error ? error.message : '读不到页面样式');
    }
  });
  ipcMain.handle('page:styleWrite', (_event, siteDir: string, slug: string, css: string) => {
    try {
      writePageStyle(siteDir, slug, css);
      watcher?.noteWrite(join(siteDir, 'src', 'styles', 'pages', `${slug}.css`), css);
      return ok(null);
    } catch (error) {
      return fail('PAGE_STYLE', error instanceof Error ? error.message : '写不了页面样式');
    }
  });
  ipcMain.handle('page:styleReset', (_event, siteDir: string, slug: string) => {
    try {
      resetPageStyle(siteDir, slug);
      return ok(null);
    } catch (error) {
      return fail('PAGE_STYLE', error instanceof Error ? error.message : '恢复不了默认样式');
    }
  });
  ipcMain.handle(
    'canvas:setVisual',
    (_event, siteDir: string, elementId: string, text: string, file?: string) => {
      try {
        setVisualText(siteDir, elementId, text, safePage(file));
        return ok(null);
      } catch (error) {
        return fail('CANVAS_VISUAL', error instanceof Error ? error.message : '画面上改不了');
      }
    },
  );
  ipcMain.handle(
    'canvas:setText',
    (_event, siteDir: string, nodeId: string, text: string, file?: string) => {
      try {
        setPageText(siteDir, nodeId, text, safePage(file));
        return ok(null);
      } catch (error) {
        return fail('CANVAS_TEXT', error instanceof Error ? error.message : '改不了文字');
      }
    },
  );
  ipcMain.handle('canvas:props', (_event, name: string) =>
    ok(
      manifest.find((item) => item.name === name)?.props ??
        layoutSpecs.find((item) => item.name === name)?.props ??
        [],
    ),
  );
  ipcMain.handle(
    'canvas:setProp',
    (
      _event,
      siteDir: string,
      nodeId: string,
      name: string,
      value: string | number | boolean,
      file?: string,
    ) => {
      try {
        setComponentProp(siteDir, nodeId, name, value, safePage(file));
        return ok(null);
      } catch (error) {
        return fail('CANVAS_PROP', error instanceof Error ? error.message : '改不了属性');
      }
    },
  );
  ipcMain.handle('section:list', (_event, siteDir: string) => {
    try {
      return ok(listSections(siteDir));
    } catch (error) {
      return fail('SECTION_LIST', error instanceof Error ? error.message : '读不到自定义区块');
    }
  });
  ipcMain.handle('section:usage', (_event, siteDir: string, names: string[]) => {
    try {
      return ok(usageCounts(siteDir, names));
    } catch (error) {
      return fail('SECTION_USAGE', error instanceof Error ? error.message : '统计不了引用');
    }
  });
  ipcMain.handle(
    'section:save',
    (_event, siteDir: string, file: string, nodeId: string, label: string) => {
      try {
        return ok(saveSection(siteDir, file, nodeId, label));
      } catch (error) {
        return fail('SECTION_SAVE', error instanceof Error ? error.message : '存不了区块');
      }
    },
  );
  ipcMain.handle('article:css', (_event, siteDir: string) => {
    try {
      return ok(readArticleCss(siteDir));
    } catch (error) {
      return fail('ARTICLE_CSS', error instanceof Error ? error.message : '读不到站点样式');
    }
  });
  ipcMain.handle('seo:check', (_event, siteDir: string) => {
    try {
      return ok(seoRows(readConfig(siteDir), listPosts(siteDir)));
    } catch (error) {
      return fail('SEO_CHECK', error instanceof Error ? error.message : '体检失败');
    }
  });

  async function auditSite(siteDir: string) {
    if (!siteDir) return fail('SEO_AUDIT', '还没有选择站点');
    const reportPath = join(siteDir, '.xiao', 'seo-report.json');
    const resumePreview = runtime.devRunning(siteDir);
    try {
      try {
        unlinkSync(reportPath);
      } catch {
        // 没有旧报告可删。删掉是为了别把上次的成功报告当成这次的结果。
      }
      const task = await runtime.start('build', siteDir);
      if (resumePreview) {
        // 预览拉起要等 dev 就绪，不能挡住体检结果。失败仍走原来的退出通知。
        void runtime.resumeDev(siteDir);
      }
      const code = task.code ?? 1;
      const buildFailed = code !== 0;
      const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
      const plainLog = (task.log ?? '').replace(/\u001b\[[0-9;]*m/g, '');
      return ok({
        code,
        buildFailed,
        report,
        message: buildFailed ? readableBuildError(task.log ?? '') : '',
        log: buildFailed ? plainLog.slice(-8000) : '',
        previewError: '',
      });
    } catch (error) {
      return fail('SEO_AUDIT', error instanceof Error ? error.message : '体检失败');
    }
  }

  ipcMain.handle('seo:audit', (_event, siteDir: string) => auditSite(siteDir));
  ipcMain.handle('publish:preflight', async (_event, siteDir: string) => {
    if (!siteDir) return fail('PUBLISH_CHECK', '还没有选择站点');
    try {
      const config = readConfig(siteDir);
      const target = deployStore().read()[siteDir];
      const audit = await auditSite(siteDir);
      if (!audit.ok) return fail('PUBLISH_CHECK', audit.message);
      const reportIssues = Array.isArray(audit.data.report?.issues) ? audit.data.report.issues : [];
      const prebuild = seoRows(config, listPosts(siteDir)).filter((row) => row.level === 'error');
      const errors: { rule: string; detail: string }[] = [];
      const seen = new Set<string>();
      for (const issue of [...prebuild, ...reportIssues.filter((row) => row.level === 'error')]) {
        const rule = String(issue.rule ?? '');
        const detail = String(issue.detail ?? '');
        const key = `${rule}|${detail}`;
        if (seen.has(key)) continue;
        seen.add(key);
        errors.push({ rule, detail });
      }
      const items = buildPreflight({
        siteUrl: config.site.url ?? '',
        targetUrl: target?.siteUrl ?? '',
        workflowReady: existsSync(join(siteDir, '.gitea', 'workflows', 'xiao-deploy.yml')),
        buildFailed: audit.data.buildFailed,
        buildMessage: audit.data.message,
        errors,
      });
      return ok({ items, blocked: items.some((item) => !item.ok) });
    } catch (error) {
      return fail('PUBLISH_CHECK', error instanceof Error ? error.message : '发布前检查失败');
    }
  });
  ipcMain.handle('seo:report', (_event, siteDir: string) => {
    if (!siteDir) return fail('SEO_REPORT', '还没有选择站点');
    try {
      const reportPath = join(siteDir, '.xiao', 'seo-report.json');
      if (!existsSync(reportPath)) return ok(null);
      return ok(JSON.parse(readFileSync(reportPath, 'utf8')));
    } catch (error) {
      return fail('SEO_REPORT', error instanceof Error ? error.message : '读不到体检报告');
    }
  });
  ipcMain.handle('content:list', (_event, siteDir: string) => ok(listPosts(siteDir)));
  ipcMain.handle(
    'content:create',
    (
      _event,
      siteDir: string,
      title: string,
      category: string,
      format: 'markdown' | 'html' = 'markdown',
      standalone = false,
    ) => {
      try {
        const post = createPost(siteDir, title, category, format, standalone);
        return ok(post);
      } catch (error) {
        return fail('CONTENT_CREATE', error instanceof Error ? error.message : '新建文章失败');
      }
    },
  );
  ipcMain.handle('content:customize', (_event, siteDir: string, slug: string) => {
    try {
      return ok(customizePost(siteDir, slug));
    } catch (error) {
      return fail('CONTENT_CUSTOM', error instanceof Error ? error.message : '自定义失败');
    }
  });
  ipcMain.handle('content:layoutRead', (_event, siteDir: string, slug: string) => {
    try {
      return ok(readLayoutComparison(siteDir, slug));
    } catch (error) {
      return fail('CONTENT_LAYOUT_READ', error instanceof Error ? error.message : '读不到版式');
    }
  });
  ipcMain.handle('content:resetLayout', (_event, siteDir: string, slug: string) => {
    try {
      return ok(resetPostLayout(siteDir, slug));
    } catch (error) {
      return fail('CONTENT_LAYOUT_RESET', error instanceof Error ? error.message : '恢复失败');
    }
  });
  ipcMain.handle('content:delete', (_event, siteDir: string, slug: string) => {
    deletePost(siteDir, slug);
    return ok(null);
  });
  ipcMain.handle('content:read', (_event, siteDir: string, slug: string) => {
    try {
      return ok(readPostFile(siteDir, slug));
    } catch (error) {
      return fail('CONTENT_READ', error instanceof Error ? error.message : '读不到文章');
    }
  });
  ipcMain.handle('content:write', (_event, siteDir: string, slug: string, markdown: string) => {
    const format = writePostFile(siteDir, slug, markdown);
    const file = format === 'html' ? 'index.html' : 'index.md';
    watcher?.noteWrite(join(siteDir, 'src', 'content', 'posts', slug, file), markdown);
    return ok(null);
  });
  ipcMain.handle(
    'content:saveImage',
    (_event, siteDir: string, slug: string, name: string, base64: string) => {
      const relative = saveImage(siteDir, slug, name, Buffer.from(base64, 'base64'));
      return ok(relative);
    },
  );
  ipcMain.handle('content:rename', (_event, siteDir: string, from: string, to: string) => {
    try {
      return ok(renamePost(siteDir, from, to));
    } catch (error) {
      return fail('CONTENT_RENAME', error instanceof Error ? error.message : '重命名失败');
    }
  });
  ipcMain.handle('media:list', (_event, siteDir: string) => {
    try {
      return ok(listMedia(siteDir));
    } catch (error) {
      return fail('MEDIA_LIST', error instanceof Error ? error.message : '读取媒体库失败');
    }
  });
  ipcMain.handle(
    'media:upload',
    (_event, siteDir: string, files: MediaUploadInput[], target?: string) => {
      try {
        return ok(uploadMedia(siteDir, files, target));
      } catch (error) {
        return fail('MEDIA_UPLOAD', error instanceof Error ? error.message : '上传图片失败');
      }
    },
  );
  ipcMain.handle('media:delete', (_event, siteDir: string, relPaths: string[], force?: boolean) => {
    try {
      return ok(deleteMedia(siteDir, relPaths, force === true));
    } catch (error) {
      return fail('MEDIA_DELETE', error instanceof Error ? error.message : '删除图片失败');
    }
  });
  ipcMain.handle('media:rename', (_event, siteDir: string, relPath: string, newName: string) => {
    try {
      return ok(renameMedia(siteDir, relPath, newName));
    } catch (error) {
      return fail('MEDIA_RENAME', error instanceof Error ? error.message : '重命名图片失败');
    }
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
  destroyDock();
  watcher?.stop();
});

app.on('window-all-closed', () => {
  app.quit();
});
