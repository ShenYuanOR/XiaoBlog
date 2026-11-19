import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match?.[1] ?? '';
}

function flagged(text, key) {
  return new RegExp(`^${key}:\\s*true\\s*$`, 'm').test(frontmatter(text));
}

/** 草稿和 noindex 文章不进 sitemap。 */
function hiddenPostSlugs() {
  const dir = path.join(root, 'src', 'content', 'posts');
  const slugs = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return slugs;
  }
  for (const name of names) {
    const folder = path.join(dir, name);
    if (!statSync(folder).isDirectory()) continue;
    for (const file of ['index.md', 'index.html']) {
      const full = path.join(folder, file);
      try {
        const text = readFileSync(full, 'utf8');
        if (flagged(text, 'draft') || flagged(text, 'noindex')) slugs.push(name);
      } catch {
        // 这个格式的文件不存在
      }
    }
  }
  return slugs;
}

/** @astrojs/sitemap 的 filter：排除 404、搜索页和 noindex/草稿文章。 */
export function allowInSitemap(page) {
  const pathname = new URL(page).pathname.replace(/\/+$/, '') || '/';
  if (/(^|\/)(404|search)$/.test(pathname)) return false;
  return !hiddenPostSlugs().some((slug) => pathname.endsWith(`/posts/${slug}`));
}
