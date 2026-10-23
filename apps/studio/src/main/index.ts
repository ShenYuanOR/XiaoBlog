import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell } from 'electron';
import { fail, ok } from '@xiao/core/ipc';
import type { AppInfo, RuntimeKind } from '@xiao/core/ipc';
import { RuntimeService } from './runtime.ts';
import { createSite, pickDirectory, readRecent, remember, siteTitle } from './project.ts';
import {
  focusPreview,
  focusSelector,
  isPreviewContents,
  applyPreviewMode,
  destroyDock,
  hideDock,
  hidePageEditor,
  showDock,
  showPageEditor,
  showPreview,
  type PreviewMode,
  type DockInput,
} from './preview.ts';
import { SiteWatcher } from './watch.ts';
import {
  createDeployStore,
  createNetHttpClient,
  probeRemote,
  pushSite,
  remoteDefaultBranch,
  type DeployTarget,
} from './publish.ts';
import { readPageStyle, resetPageStyle, writePageStyle } from './page-style.ts';
import {
  createPost,
  customizePost,
  deletePost,
  listPosts,
  readPostFile,
  renamePost,
  saveImage,
  writePostFile,
} from './content.ts';
import { readConfig, writeConfig, type SiteConfig } from './settings.ts';
import { seoRows } from './seo.ts';
import {
  insertComponent,
  moveComponent,
  nestingAllowed,
  readOutline,
  redoPage,
  safePage,
  setComponentProp,
  setPageText,
  setVisualText,
  undoPage,
} from './canvas.ts';
import { createPage, listPages, pageHref, type PageTemplate } from './pages.ts';
import { lintSource, listSourceFiles, readSource, writeSource } from './develop.ts';
import { writeDeployFiles } from './deploy-files.ts';
import { groupChanges, rememberDeploy, type DeployRecord } from './release-gate.ts';
import { GitHubService } from './github.ts';
import { redactSecrets, SecretService } from './secret.ts';
import { manifest } from '@xiao/core/components';

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
    const slug = url.searchParams.get('slug') ?? '';
    const name = url.pathname.split('/').pop() ?? '';
    const file = join(siteDir, 'src', 'content', 'posts', slug, name);
    return net.fetch(pathToFileURL(file).href);
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
  if (!app.isPackaged && !process.argv.includes('--probe')) {
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'detach' });
    });
  }
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

function deployStore(): ReturnType<typeof createDeployStore> {
  return createDeployStore(join(app.getPath('userData'), 'deploy-targets.json'));
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
  mkdirSync(app.getPath('userData'), { recursive: true });
  let all: Record<string, DeployRecord[]> = {};
  try {
    all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, DeployRecord[]>;
  } catch {
    all = {};
  }
  all[siteDir] = rows;
  writeFileSync(file, `${JSON.stringify(all)}\n`);
}

if (!app.isPackaged) {
  const port = process.env.XIAO_CDP_PORT || '9222';
  app.commandLine.appendSwitch('remote-debugging-port', port);
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

app.whenReady().then(() => {
  registerProtocol();
  ipcMain.handle('app:getInfo', () =>
    ok<AppInfo>({ name: '晓', version: app.getVersion(), packaged: app.isPackaged }),
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
  ipcMain.handle(
    'preview:editor',
    (
      event,
      url: string,
      bounds: { x: number; y: number; width: number; height: number } | null,
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !url || !bounds) {
        hidePageEditor();
        return ok(null);
      }
      showPageEditor(win, url, bounds);
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
  ipcMain.handle('page:href', (_event, siteDir: string, file: string) =>
    ok(pageHref(siteDir, file)),
  );
  ipcMain.on('preview:text', (event, payload: { file: string; offset: string; text: string }) => {
    if (!isPreviewContents(event.sender)) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents !== event.sender) win.webContents.send('preview:onText', payload);
    }
  });
  ipcMain.on('preview:pick', (event, payload: { file: string; offset: string }) => {
    if (!isPreviewContents(event.sender)) return;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('preview:onPick', payload);
    }
  });
  ipcMain.handle('preview:focus', (_event, file: string, offset: string) => {
    focusPreview(file, offset);
    return ok(null);
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
  ipcMain.handle('settings:write', (_event, siteDir: string, config: SiteConfig) => {
    const errors = writeConfig(siteDir, config);
    return ok(errors);
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
  ipcMain.handle('publish:changes', (_event, siteDir: string) => {
    try {
      const text = execFileSync('git', ['status', '--porcelain'], {
        cwd: siteDir,
        encoding: 'utf8',
      });
      return ok(groupChanges(text.split('\n').filter(Boolean)));
    } catch {
      return ok({ posts: [], pages: [], settings: [] });
    }
  });
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
    ) => {
      const url = remoteUrl.trim().replace(/\/$/, '');
      if (!/^https?:\/\//.test(url)) {
        return fail('PUBLISH_URL', '仓库地址要以 http:// 或 https:// 开头');
      }
      if (!token.trim()) return fail('PUBLISH_TOKEN', '先填访问令牌');
      const probe = await probeRemote(url, login.trim(), token.trim(), publishHttp);
      if (!probe.ok) return fail('PUBLISH_PROBE', probe.message);
      const branch = await remoteDefaultBranch(url, login.trim(), token.trim(), publishHttp);
      const target: DeployTarget = {
        provider,
        remoteUrl: url,
        branch,
        ...(login.trim() ? { login: login.trim() } : {}),
      };
      secretStore().save(siteDir, token.trim(), '');
      const all = deployStore().read();
      all[siteDir] = target;
      deployStore().write(all);
      return ok(target);
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
      return fail('PUBLISH_PUSH', redactSecrets(message, [token]));
    }
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
  ipcMain.handle('dev:lint', (_event, siteDir: string, file: string) => {
    try {
      return ok(lintSource(siteDir, file));
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
    ok(manifest.find((item) => item.name === name)?.props ?? []),
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
  ipcMain.handle('seo:check', (_event, siteDir: string) => {
    try {
      return ok(seoRows(readConfig(siteDir), listPosts(siteDir)));
    } catch (error) {
      return fail('SEO_CHECK', error instanceof Error ? error.message : '体检失败');
    }
  });
  ipcMain.handle('content:list', (_event, siteDir: string) => ok(listPosts(siteDir)));
  ipcMain.handle('content:create', (_event, siteDir: string, title: string, category: string) => {
    try {
      const post = createPost(siteDir, title, category);
      return ok(post);
    } catch (error) {
      return fail('CONTENT_CREATE', error instanceof Error ? error.message : '新建文章失败');
    }
  });
  ipcMain.handle('content:customize', (_event, siteDir: string, slug: string) => {
    try {
      return ok(customizePost(siteDir, slug));
    } catch (error) {
      return fail('CONTENT_CUSTOM', error instanceof Error ? error.message : '自定义失败');
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
    writePostFile(siteDir, slug, markdown);
    watcher?.noteWrite(join(siteDir, 'src', 'content', 'posts', slug, 'index.md'), markdown);
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
