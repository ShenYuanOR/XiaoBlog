import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, writeFileSync } from 'node:fs';
import { app, BrowserWindow, ipcMain, net, protocol, safeStorage } from 'electron';
import { fail, ok } from '@xiao/core/ipc';
import type { AppInfo, RuntimeKind } from '@xiao/core/ipc';
import { RuntimeService } from './runtime.ts';
import { createSite, pickDirectory, readRecent, remember, siteTitle } from './project.ts';
import { focusPreview, isPreviewContents, showPreview, type PreviewMode } from './preview.ts';
import { SiteWatcher } from './watch.ts';
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
  undoPage,
} from './canvas.ts';
import { createPage, listPages, type PageTemplate } from './pages.ts';
import { lintSource, listSourceFiles, readSource, writeSource } from './develop.ts';
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
      void showPreview(item, event.url, 'pc');
    });
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
  ipcMain.handle(
    'preview:set',
    async (event, mode: PreviewMode, url: string, customWidth?: number) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !url) return fail('PREVIEW', '还没有预览地址');
      const widths = await showPreview(win, url, mode, customWidth);
      return ok(widths);
    },
  );
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
  watcher?.stop();
});

app.on('window-all-closed', () => {
  app.quit();
});
