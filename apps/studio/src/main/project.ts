import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, session } from 'electron';
import {
  copyTemplate,
  initRepository,
  placeLockfile,
  siteFolderName,
  writeSiteBasics,
} from './scaffold.ts';
import type { RuntimeService } from './runtime.ts';

export interface RecentSite {
  dir: string;
  title: string;
  openedAt: string;
}

export function templateRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'template');
  return path.resolve(process.cwd(), '../../packages/template');
}

export function lockfilePath(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'site-lock', 'pnpm-lock.yaml');
  return path.resolve(process.cwd(), 'resources/site-lock/pnpm-lock.yaml');
}

function recentFile(): string {
  return path.join(app.getPath('userData'), 'recent.json');
}

export function readRecent(): RecentSite[] {
  try {
    const parsed = JSON.parse(readFileSync(recentFile(), 'utf8')) as RecentSite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function remember(dir: string, title: string): RecentSite[] {
  const next = [
    { dir, title, openedAt: new Date().toISOString() },
    ...readRecent().filter((item) => item.dir !== dir),
  ].slice(0, 8);
  // 最近项目只是便利功能：userData 写不进去（权限/杀软/只读）时不能拖垮「打开站点」。
  try {
    mkdirSync(path.dirname(recentFile()), { recursive: true });
    writeFileSync(recentFile(), `${JSON.stringify(next, null, 2)}\n`);
  } catch (error) {
    console.warn(`记录最近项目失败：${error instanceof Error ? error.message : String(error)}`);
  }
  return next;
}

export function openPreview(url: string): void {
  const preview = new BrowserWindow({
    width: 1100,
    height: 760,
    title: '预览',
    webPreferences: {
      session: session.fromPartition('preview'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  void preview.loadURL(url);
}

export async function createSite(
  runtime: RuntimeService,
  parent: string,
  title: string,
  author: string,
): Promise<{ dir: string; title: string }> {
  const folder = siteFolderName(title);
  const dir = path.join(parent, folder);
  if (existsSync(dir)) throw new Error('这个文件夹已经存在');
  if (!existsSync(templateRoot())) throw new Error('找不到站点模板');
  copyTemplate(templateRoot(), dir);
  if (existsSync(lockfilePath())) placeLockfile(dir, lockfilePath());
  writeSiteBasics(dir, title, author.trim() || '晓');
  const installed = await runtime.start('install', dir);
  if (installed.code !== 0) {
    const detail = installed.log?.replace(/\u001b\[[0-9;]*m/g, '').trim() ?? '';
    const tail = detail.length > 8000 ? detail.slice(-8000) : detail;
    throw new Error(tail ? `依赖没有装好\n${tail}` : '依赖没有装好');
  }
  await initRepository(dir, author.trim() || '晓');
  await runtime.start('dev', dir);
  remember(dir, title);
  return { dir, title };
}

export async function pickDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

export function siteTitle(dir: string): string {
  try {
    const config = JSON.parse(readFileSync(path.join(dir, 'xiao.config.json'), 'utf8')) as {
      site?: { title?: string };
    };
    return config.site?.title || path.basename(dir);
  } catch {
    return path.basename(dir);
  }
}
