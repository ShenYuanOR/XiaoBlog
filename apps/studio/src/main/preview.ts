import { join } from 'node:path';
import { BrowserWindow, screen, session, WebContentsView, type WebContents } from 'electron';

export const previewWidths = { phone: 390, tablet: 820, pc: 1280 } as const;
export type PreviewMode = keyof typeof previewWidths | 'custom' | 'side';

const TOOLBAR = 44;
const NOT_FOUND_TITLE = '找不到页面';
const views: WebContentsView[] = [];
const finishHandlers = new WeakMap<WebContents, () => void>();
let host: BrowserWindow | null = null;
let onResize: (() => void) | null = null;
let lastUrl = '';
let lastMode: PreviewMode = 'pc';
let lastCatalog: { name: string; label: string }[] = [];

function deliverCatalog(contents: WebContents): void {
  if (contents.isDestroyed()) return;
  contents.send('preview:catalog', lastCatalog);
}

const chromeHtml = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;font:13px system-ui,"Segoe UI","Microsoft YaHei",sans-serif;background:#1d2430;color:#fff}
  .bar{display:flex;gap:6px;align-items:center;height:${TOOLBAR}px;padding:0 12px}
  button{height:28px;border:0;border-radius:8px;background:#2c3544;color:#fff;padding:0 10px;cursor:pointer}
  button.on{background:#1d4ed8}
</style><div class="bar"><strong>预览</strong>
  <button data-mode="phone">手机</button>
  <button data-mode="tablet">平板</button>
  <button data-mode="pc" class="on">电脑</button>
  <button data-mode="side">并排</button>
</div><script>
  const buttons=[...document.querySelectorAll('button')]
  buttons.forEach(button=>button.addEventListener('click',()=>{
    window.xiaoChrome.setMode(button.dataset.mode)
  }))
</script>`;

function notifyPreviewWindow(open: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === host) continue;
    win.webContents.send('preview:onWindow', { open });
  }
}

function previewHost(): BrowserWindow {
  if (host && !host.isDestroyed()) return host;
  host = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 420,
    title: '预览',
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/preview-chrome.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  host.setMenu(null);
  void host.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(chromeHtml)}`);
  host.on('closed', () => {
    views.length = 0;
    host = null;
    if (onResize) onResize = null;
    notifyPreviewWindow(false);
  });
  return host;
}

export function isPreviewWindowOpen(): boolean {
  return Boolean(host && !host.isDestroyed());
}

/**
 * 新建草稿时路由可能晚半拍才挂上，第一次会先打开 404。
 * 标题还是「找不到页面」就隔一会儿再载入，最多 5 次。
 */
function loadAuthoringPage(contents: WebContents, url: string): void {
  const previous = finishHandlers.get(contents);
  if (previous) contents.removeListener('did-finish-load', previous);
  let tries = 0;
  const onFinish = (): void => {
    if (contents.isDestroyed()) return;
    deliverCatalog(contents);
    const missing = contents.getTitle().includes(NOT_FOUND_TITLE);
    if (!missing || tries >= 5) {
      contents.removeListener('did-finish-load', onFinish);
      finishHandlers.delete(contents);
      return;
    }
    tries += 1;
    setTimeout(() => {
      if (!contents.isDestroyed()) void contents.loadURL(url);
    }, 500);
  };
  finishHandlers.set(contents, onFinish);
  contents.on('did-finish-load', onFinish);
  void contents.loadURL(url);
}

export function applyPreviewMode(mode: PreviewMode): Promise<number[]> | undefined {
  if (!lastUrl) return undefined;
  return showPreview(lastUrl, mode);
}

export function clearPreview(): void {
  const win = host;
  for (const view of views) {
    if (win && !win.isDestroyed()) win.contentView.removeChildView(view);
    view.webContents.close();
  }
  views.length = 0;
}

export async function showPreview(
  url: string,
  mode: PreviewMode,
  customWidth = 1024,
): Promise<number[]> {
  const reuse = Boolean(host && !host.isDestroyed() && views.length > 0 && lastMode === mode);
  lastUrl = url;
  lastMode = mode;
  if (reuse && host && !host.isDestroyed()) {
    const win = host;
    win.show();
    win.focus();
    for (const view of views) loadAuthoringPage(view.webContents, url);
    notifyPreviewWindow(true);
    const requested =
      mode === 'side' ? [390, 820, 1280] : [mode === 'custom' ? customWidth : previewWidths[mode]];
    return requested;
  }
  clearPreview();
  const win = previewHost();
  const requested =
    mode === 'side' ? [390, 820, 1280] : [mode === 'custom' ? customWidth : previewWidths[mode]];
  const work = screen.getPrimaryDisplay().workAreaSize;
  const sum = requested.reduce((total, width) => total + width, 0);
  const windowWidth = Math.min(sum, Math.max(420, work.width - 80));
  const scale = windowWidth / sum;
  const widths = requested.map((width) => Math.max(160, Math.floor(width * scale)));
  const height = Math.min(860, Math.max(640, work.height - 80));
  win.setContentSize(
    widths.reduce((total, width) => total + width, 0),
    height,
  );
  const place = (): void => {
    if (win.isDestroyed()) return;
    const [, contentHeight] = win.getContentSize();
    const viewHeight = Math.max(120, contentHeight - TOOLBAR);
    let nextX = 0;
    for (let index = 0; index < views.length; index += 1) {
      const lane = widths[index] ?? 390;
      views[index]?.setBounds({ x: nextX, y: TOOLBAR, width: lane, height: viewHeight });
      nextX += lane;
    }
  };
  if (onResize) win.removeListener('resize', onResize);
  onResize = place;
  win.on('resize', place);
  win.show();
  win.focus();
  const shown: number[] = [];
  for (let index = 0; index < widths.length; index += 1) {
    const lane = widths[index] ?? 390;
    const device = requested[index] ?? lane;
    const view = new WebContentsView({
      webPreferences: {
        session: session.fromPartition('preview'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.contentView.addChildView(view);
    views.push(view);
    loadAuthoringPage(view.webContents, url);
    try {
      view.webContents.debugger.attach('1.3');
      await view.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: device,
        height: 800,
        deviceScaleFactor: 1,
        mobile: device < 768,
      });
    } catch {
      // 调试器占线时仍显示页面，宽度按钮下次再试。
    }
    shown.push(device);
  }
  place();
  notifyPreviewWindow(true);
  void win.webContents
    .executeJavaScript(
      `document.querySelectorAll('button').forEach(button => button.classList.toggle('on', button.dataset.mode === ${JSON.stringify(lastMode)}))`,
    )
    .catch(() => undefined);
  return shown;
}

const PREVIEW_FRAME = 'xiao-preview';

export function isEmbeddedPreviewFrame(frame: { name: string } | null | undefined): boolean {
  return Boolean(frame && frame.name.startsWith(PREVIEW_FRAME));
}

const expectedPreviewUrl = new Map<string, string>();

function pageKey(url: string): string {
  try {
    const parsed = new URL(url);
    const path = decodeURI(parsed.pathname).replace(/\/+$/, '') || '/';
    return `${parsed.origin}${path}`;
  } catch {
    return '';
  }
}

export function expectPreviewUrl(name: string, url: string): void {
  if (!name.startsWith(PREVIEW_FRAME) || !url) return;
  expectedPreviewUrl.set(name, url);
}

/** 只拦预览 iframe 自己发起的跨页导航。父页面改 src 之前会先登记目标地址。 */
export function installPreviewNavigationLock(win: BrowserWindow): void {
  win.webContents.on('will-frame-navigate', (event) => {
    const frame = event.frame;
    if (!isEmbeddedPreviewFrame(frame)) return;
    const next = event.url;
    const expected = expectedPreviewUrl.get(frame.name);
    if (expected && pageKey(expected) === pageKey(next)) return;
    const current = frame?.url ?? '';
    if (!current || current === 'about:blank') return;
    if (pageKey(current) === pageKey(next)) return;
    event.preventDefault();
  });
}

export function reloadPreviewDocuments(): void {
  for (const frame of embeddedFrames()) {
    if (!frame.url || frame.url === 'about:blank') continue;
    void frame.executeJavaScript('location.reload()').catch(() => undefined);
  }
  for (const view of views) {
    if (!view.webContents.isDestroyed()) view.webContents.reload();
  }
}

function embeddedFrames(): Electron.WebFrameMain[] {
  const found: Electron.WebFrameMain[] = [];
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    for (const frame of win.webContents.mainFrame.framesInSubtree) {
      if (frame.name.startsWith(PREVIEW_FRAME)) found.push(frame);
    }
  }
  return found;
}

/** 主窗口里的预览已经是 iframe，这个入口留着避免旧调用再造原生层。 */
export function showPageEditor(): void {
  return;
}

export function hidePageEditor(): void {
  return;
}

export function rememberCatalog(items: { name: string; label: string }[]): void {
  lastCatalog = items;
  sendToPreview('preview:catalog', items);
}

export function sendToPreview(channel: string, payload: unknown): void {
  for (const view of views) {
    if (!view.webContents.isDestroyed()) view.webContents.send(channel, payload);
  }
  for (const frame of embeddedFrames()) {
    if (!frame.isDestroyed()) frame.send(channel, payload);
  }
}

export function isPreviewContents(contents: WebContents): boolean {
  return views.some((view) => view.webContents === contents);
}

export function isPreviewFrameSender(frame: { name: string } | null | undefined): boolean {
  return isEmbeddedPreviewFrame(frame);
}

export interface DockBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DockDevice = 'phone' | 'tablet' | 'pc' | 'side';

export interface DockInput {
  enabled: boolean;
  url: string;
  device: DockDevice;
  bounds: DockBounds;
  zoom?: number;
  /** 页面画布要悬停和点选；文章预览只展示。 */
  interactive?: boolean;
}

export type StageHit = {
  file: string;
  offset: string;
  place: 'before' | 'after' | 'into';
  tag: string;
};

let dockZoom = 1;

function sendCamera(): void {
  for (const frame of embeddedFrames()) {
    if (!frame.name.startsWith('xiao-preview-dock')) continue;
    if (!frame.isDestroyed()) frame.send('preview:camera', { zoom: dockZoom });
  }
}

/** 预览坞改由渲染进程的 iframe 绘制。这里不再创建原生层。 */
export function showDock(): void {
  return;
}

export function hideDock(): void {
  return;
}

export function destroyDock(): void {
  return;
}

export function focusPreview(
  file: string,
  offset: string,
  label?: string,
  handles?: { width?: boolean; pad?: boolean },
): void {
  const payload = file ? { file, offset, label, handles } : null;
  for (const view of views) view.webContents.send('preview:focus', payload);
  for (const frame of embeddedFrames()) {
    if (!frame.isDestroyed()) frame.send('preview:focus', payload);
  }
}

export async function focusSelector(selector: string): Promise<void> {
  const script = `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`;
  for (const view of views) await view.webContents.executeJavaScript(script);
  for (const frame of embeddedFrames()) {
    if (!frame.isDestroyed()) await frame.executeJavaScript(script);
  }
}

export async function hitPreview(clientX: number, clientY: number): Promise<StageHit | null> {
  for (const frame of embeddedFrames()) {
    if (!frame.name.startsWith('xiao-preview-dock') || frame.isDestroyed()) continue;
    try {
      const hit = (await frame.executeJavaScript(
        `window.__xiaoStage?.hit(${clientX},${clientY}) ?? null`,
      )) as StageHit | null;
      if (hit) return hit;
    } catch {
      return null;
    }
  }
  return null;
}

export function hintDrop(hit: StageHit | null): void {
  for (const frame of embeddedFrames()) {
    if (frame.name.startsWith('xiao-preview-dock') && !frame.isDestroyed()) {
      frame.send('preview:drop', hit);
    }
  }
}

export function setDockZoom(zoom: number): void {
  dockZoom = Math.min(2, Math.max(0.5, zoom));
  sendCamera();
}
