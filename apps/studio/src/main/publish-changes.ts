import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePostMeta } from './content.ts';
import { emptyChanges, parseStatus, summarizeChanges, type ChangeSummary } from './release-gate.ts';

function titleFromRaw(raw: string, slug: string, html: boolean): string {
  return parsePostMeta(raw, slug, html ? 'html' : 'markdown').title;
}

/** 磁盘上还在的读文件；已删除的从 HEAD 读标题。读不到就用目录名。 */
export function readPostTitle(siteDir: string, slug: string): string {
  const names = ['index.md', 'index.html'] as const;
  for (const name of names) {
    const full = join(siteDir, 'src', 'content', 'posts', slug, name);
    if (!existsSync(full)) continue;
    return titleFromRaw(readFileSync(full, 'utf8'), slug, name.endsWith('.html'));
  }
  for (const name of names) {
    const rel = `src/content/posts/${slug}/${name}`;
    try {
      const raw = execFileSync('git', ['show', `HEAD:${rel}`], {
        cwd: siteDir,
        encoding: 'utf8',
        windowsHide: true,
      });
      return titleFromRaw(raw, slug, name.endsWith('.html'));
    } catch {
      // 这篇在 HEAD 里没有这种格式。
    }
  }
  return slug;
}

/** `.pnpm-store` 是本机依赖缓存，不排除的话 status 会有上万行。 */
export function collectChanges(siteDir: string): ChangeSummary {
  try {
    const text = execFileSync(
      'git',
      ['status', '--porcelain', '-uall', '--', '.', ':(exclude).pnpm-store', ':(exclude)node_modules'],
      { cwd: siteDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true },
    );
    return summarizeChanges(parseStatus(text), (slug) => readPostTitle(siteDir, slug));
  } catch {
    return emptyChanges();
  }
}
