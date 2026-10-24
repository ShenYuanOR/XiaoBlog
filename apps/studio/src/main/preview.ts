import { join } from 'node:path';
import { BrowserWindow, screen, session, WebContentsView, type WebContents } from 'electron';

export const previewWidths = { phone: 390, tablet: 820, pc: 1280 } as const;
export type PreviewMode = keyof typeof previewWidths | 'custom' | 'side';

const TOOLBAR = 44;
const views: WebContentsView[] = [];
let host: BrowserWindow | null = null;
let onResize: (() => void) | null = null;
let lastUrl = '';
let lastMode: PreviewMode = 'pc';

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
  });
  return host;
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
  clearPreview();
  lastUrl = url;
  lastMode = mode;
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
    await view.webContents.loadURL(url);
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
  void win.webContents
    .executeJavaScript(
      `document.querySelectorAll('button').forEach(button => button.classList.toggle('on', button.dataset.mode === ${JSON.stringify(lastMode)}))`,
    )
    .catch(() => undefined);
  return shown;
}

let editorView: WebContentsView | null = null;
let editorWindow: BrowserWindow | null = null;

function previewContents(): WebContentsView {
  return new WebContentsView({
    webPreferences: {
      session: session.fromPartition('preview'),
      preload: join(import.meta.dirname, '../preload/preview.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
}

export function showPageEditor(
  win: BrowserWindow,
  url: string,
  bounds: { x: number; y: number; width: number; height: number },
): void {
  if (bounds.width < 40 || bounds.height < 40) return;
  if (!editorView || editorWindow !== win) {
    hidePageEditor();
    editorView = previewContents();
    editorWindow = win;
    win.contentView.addChildView(editorView);
  }
  editorView.setBounds({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  });
  const current = editorView.webContents.getURL();
  if (current !== url) void editorView.webContents.loadURL(url);
}

export function hidePageEditor(): void {
  if (editorView && editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.contentView.removeChildView(editorView);
    editorView.webContents.close();
  }
  editorView = null;
  editorWindow = null;
}

export function isPreviewContents(contents: WebContents): boolean {
  return (
    views.some((view) => view.webContents === contents) ||
    editorView?.webContents === contents ||
    dockLanes.some((lane) => lane.view.webContents === contents)
  );
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
}

export type StageHit = {
  file: string;
  offset: string;
  place: 'before' | 'after' | 'into';
  tag: string;
};

type DockLane = { view: WebContentsView; device: 'phone' | 'tablet' | 'pc' };

let dockLanes: DockLane[] = [];
let dockWin: BrowserWindow | null = null;
let dockUrl = '';
let dockZoom = 1;

function dockViews(): WebContentsView[] {
  return dockLanes.map((lane) => lane.view);
}

function attachLane(win: BrowserWindow, lane: DockLane): void {
  if (dockWin && dockWin !== win && !dockWin.isDestroyed()) {
    dockWin.contentView.removeChildView(lane.view);
  }
  win.contentView.addChildView(lane.view);
}

async function emulateLane(lane: DockLane, width: number, height: number): Promise<void> {
  try {
    const contents = lane.view.webContents;
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
    await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: lane.device === 'phone' || (lane.device === 'tablet' && width < 768),
    });
  } catch {
    // 调试器占线时先按实际宽度显示，下一次布局再仿真。
  }
}

function sendCamera(): void {
  for (const view of dockViews()) view.webContents.send('preview:camera', { zoom: dockZoom });
}

/** 预览坞：挂在主窗口上的单页预览，按设备宽度居中显示。 */
export async function showDock(win: BrowserWindow, input: DockInput): Promise<void> {
  const bounds = input.bounds;
  if (!input.enabled || bounds.width < 120 || bounds.height < 120) {
    hideDock();
    return;
  }
  if (typeof input.zoom === 'number') dockZoom = input.zoom;
  const devices: Array<'phone' | 'tablet' | 'pc'> =
    input.device === 'side'
      ? ['phone', 'tablet', 'pc']
      : [input.device === 'phone' || input.device === 'tablet' ? input.device : 'pc'];
  while (dockLanes.length > devices.length) {
    const lane = dockLanes.pop();
    if (!lane) break;
    if (dockWin && !dockWin.isDestroyed()) dockWin.contentView.removeChildView(lane.view);
    if (!lane.view.webContents.isDestroyed()) lane.view.webContents.close();
  }
  const created: DockLane[] = [];
  while (dockLanes.length < devices.length) {
    const device = devices[dockLanes.length] ?? 'pc';
    const lane = { view: previewContents(), device };
    dockLanes.push(lane);
    created.push(lane);
  }
  const reparent = dockWin !== win;
  dockLanes.forEach((lane, index) => {
    lane.device = devices[index] ?? lane.device;
    if (reparent || created.includes(lane)) attachLane(win, lane);
  });
  dockWin = win;
  const requested = devices.map((device) => previewWidths[device]);
  const sum = requested.reduce((total, width) => total + width, 0);
  const scale = input.device === 'side' ? Math.min(1, bounds.width / sum) : 1;
  let nextX = bounds.x;
  const load = dockUrl !== input.url;
  dockUrl = input.url;
  for (let index = 0; index < dockLanes.length; index += 1) {
    const lane = dockLanes[index];
    if (!lane) continue;
    const natural = requested[index] ?? previewWidths.pc;
    const width =
      input.device === 'side'
        ? Math.max(160, Math.floor(natural * scale))
        : Math.max(160, Math.min(natural, Math.round(bounds.width)));
    const x = input.device === 'side' ? nextX : Math.round(bounds.x + (bounds.width - width) / 2);
    lane.view.setBounds({
      x,
      y: Math.round(bounds.y),
      width,
      height: Math.round(bounds.height),
    });
    nextX = x + width;
    if (load) void lane.view.webContents.loadURL(input.url);
    await emulateLane(lane, width, Math.round(bounds.height));
  }
  sendCamera();
}

/** 只从窗口摘下来，保留页面状态；再次停靠时不用重新加载。 */
export function hideDock(): void {
  if (dockWin && !dockWin.isDestroyed()) {
    for (const lane of dockLanes) dockWin.contentView.removeChildView(lane.view);
  }
  dockWin = null;
}

/** 关闭预览坞并释放 webContents。 */
export function destroyDock(): void {
  if (dockWin && !dockWin.isDestroyed()) {
    for (const lane of dockLanes) dockWin.contentView.removeChildView(lane.view);
  }
  for (const lane of dockLanes) {
    if (!lane.view.webContents.isDestroyed()) lane.view.webContents.close();
  }
  dockLanes = [];
  dockWin = null;
  dockUrl = '';
}

export function focusPreview(
  file: string,
  offset: string,
  label?: string,
  handles?: { width?: boolean; pad?: boolean },
): void {
  const payload = file ? { file, offset, label, handles } : null;
  for (const view of [...views, ...dockViews(), editorView].filter(Boolean)) {
    view?.webContents.send('preview:focus', payload);
  }
}

export async function focusSelector(selector: string): Promise<void> {
  const script = `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`;
  for (const view of [...views, ...dockViews()]) await view.webContents.executeJavaScript(script);
}

export async function hitPreview(clientX: number, clientY: number): Promise<StageHit | null> {
  for (const lane of dockLanes) {
    const box = lane.view.getBounds();
    if (
      clientX < box.x ||
      clientX > box.x + box.width ||
      clientY < box.y ||
      clientY > box.y + box.height
    ) {
      continue;
    }
    const x = clientX - box.x;
    const y = clientY - box.y;
    try {
      const hit = (await lane.view.webContents.executeJavaScript(
        `window.__xiaoStage?.hit(${x},${y}) ?? null`,
      )) as StageHit | null;
      return hit;
    } catch {
      return null;
    }
  }
  return null;
}

export function hintDrop(hit: StageHit | null): void {
  for (const view of dockViews()) view.webContents.send('preview:drop', hit);
}

export function setDockZoom(zoom: number): void {
  dockZoom = Math.min(2, Math.max(0.5, zoom));
  sendCamera();
}
