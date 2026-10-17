import { BrowserWindow, session, WebContentsView } from 'electron';

export const previewWidths = { phone: 390, tablet: 820, pc: 1280 } as const;
export type PreviewMode = keyof typeof previewWidths | 'custom' | 'side';

const views: WebContentsView[] = [];

export function clearPreview(win: BrowserWindow): void {
  for (const view of views) {
    win.contentView.removeChildView(view);
    view.webContents.close();
  }
  views.length = 0;
}

export async function showPreview(
  win: BrowserWindow,
  url: string,
  mode: PreviewMode,
  customWidth = 1024,
): Promise<number[]> {
  clearPreview(win);
  const widths =
    mode === 'side' ? [390, 820, 1280] : [mode === 'custom' ? customWidth : previewWidths[mode]];
  const bounds = win.getContentBounds();
  const lane = Math.floor(Math.min(360, (bounds.width * 0.42) / widths.length));
  const shown: number[] = [];
  for (let index = 0; index < widths.length; index += 1) {
    const width = widths[index] ?? 1280;
    const view = new WebContentsView({
      webPreferences: {
        session: session.fromPartition('preview'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.contentView.addChildView(view);
    const viewWidth = Math.max(160, lane);
    view.setBounds({
      x: bounds.width - (widths.length - index) * viewWidth,
      y: 48,
      width: viewWidth,
      height: Math.max(200, bounds.height - 48),
    });
    await view.webContents.loadURL(url);
    try {
      view.webContents.debugger.attach('1.3');
      await view.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width,
        height: 800,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
    } catch {
      // 调试器占线时仍显示页面，宽度按钮下次再试。
    }
    views.push(view);
    shown.push(width);
  }
  return shown;
}
