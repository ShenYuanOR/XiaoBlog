import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertStyleSlug(slug: string): string {
  if (!SLUG.test(slug)) throw new Error('页面标识只允许小写字母、数字和连字符');
  return slug;
}

function styleFile(siteDir: string, slug: string): string {
  return path.join(siteDir, 'src', 'styles', 'pages', `${assertStyleSlug(slug)}.css`);
}

export function readPageStyle(siteDir: string, slug: string): { css: string; exists: boolean } {
  const file = styleFile(siteDir, slug);
  if (!existsSync(file)) return { css: '', exists: false };
  return { css: readFileSync(file, 'utf8'), exists: true };
}

export function writePageStyle(siteDir: string, slug: string, css: string): void {
  const file = styleFile(siteDir, slug);
  mkdirSync(path.dirname(file), { recursive: true });
  const body = css.trim() ? `${css.trimEnd()}\n` : '';
  if (!body) {
    rmSync(file, { force: true });
    return;
  }
  writeFileSync(file, body);
}

export function resetPageStyle(siteDir: string, slug: string): void {
  rmSync(styleFile(siteDir, slug), { force: true });
}
