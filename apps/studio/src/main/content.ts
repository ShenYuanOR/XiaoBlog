import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isValidSlug, slugFromTitle } from '@xiao/core/site';

export interface PostItem {
  slug: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  draft: boolean;
}

function postsRoot(siteDir: string): string {
  return path.join(siteDir, 'src', 'content', 'posts');
}

function readPost(siteDir: string, slug: string): PostItem {
  const raw = readFileSync(path.join(postsRoot(siteDir), slug, 'index.md'), 'utf8');
  const title = raw.match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ?? slug;
  const category = raw.match(/^category:\s*"?([^"\n]+)"?/m)?.[1] ?? '';
  const description = raw.match(/^description:\s*"?([^"\n]+)"?/m)?.[1] ?? '';
  const tags = [...raw.matchAll(/^ {2}- "?([^"\n]+)"?/gm)].map((item) => item[1] ?? '');
  const draft = /^draft:\s*true/m.test(raw);
  return { slug, title, category, description, tags, draft };
}

export function readPostFile(siteDir: string, slug: string): string {
  return readFileSync(path.join(postsRoot(siteDir), slug, 'index.md'), 'utf8');
}

export function writePostFile(siteDir: string, slug: string, markdown: string): void {
  writeFileSync(path.join(postsRoot(siteDir), slug, 'index.md'), markdown);
}

export function saveImage(siteDir: string, slug: string, name: string, bytes: Uint8Array): string {
  const dir = path.join(postsRoot(siteDir), slug);
  const ext = path.extname(name) || '.png';
  const base = path.basename(name, ext).replace(/[^\w.-]+/g, '-') || 'image';
  let file = `${base}${ext}`;
  let n = 2;
  while (existsSync(path.join(dir, file))) {
    file = `${base}-${n}${ext}`;
    n += 1;
  }
  writeFileSync(path.join(dir, file), bytes);
  return `./${file}`;
}

function existsSync(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

export function listPosts(siteDir: string): PostItem[] {
  const root = postsRoot(siteDir);
  let names: string[] = [];
  try {
    names = readdirSync(root).filter((name) => statSync(path.join(root, name)).isDirectory());
  } catch {
    return [];
  }
  return names
    .filter((name) => name !== '.xiao-recycle')
    .map((slug) => readPost(siteDir, slug))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

export function createPost(siteDir: string, title: string, category: string): PostItem {
  const slug = slugFromTitle(title.trim() || 'note');
  const safe = isValidSlug(slug) ? slug : `note-${Date.now().toString(36)}`;
  const dir = path.join(postsRoot(siteDir), safe);
  mkdirSync(dir, { recursive: true });
  const date = new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 00:00:00`;
  const markdown = [
    '---',
    `title: ${JSON.stringify(title.trim() || safe)}`,
    `date: ${JSON.stringify(stamp)}`,
    category.trim() ? `category: ${JSON.stringify(category.trim())}` : null,
    'draft: true',
    '---',
    '',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
  writeFileSync(path.join(dir, 'index.md'), markdown);
  return readPost(siteDir, safe);
}

export function deletePost(siteDir: string, slug: string): void {
  const from = path.join(postsRoot(siteDir), slug);
  const bin = path.join(siteDir, '.xiao-recycle');
  mkdirSync(bin, { recursive: true });
  renameSync(from, path.join(bin, `${slug}-${Date.now().toString(36)}`));
}

export function renamePost(
  siteDir: string,
  from: string,
  to: string,
): { from: string; to: string } {
  if (!isValidSlug(to)) throw new Error('slug 只允许小写字母、数字和连字符');
  const root = postsRoot(siteDir);
  renameSync(path.join(root, from), path.join(root, to));
  const layout = path.join(siteDir, 'src', 'layouts', 'posts', `${from}.astro`);
  try {
    if (statSync(layout).isFile()) {
      renameSync(layout, path.join(siteDir, 'src', 'layouts', 'posts', `${to}.astro`));
    }
  } catch {
    // 没有自定义布局
  }
  const configPath = path.join(siteDir, 'xiao.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    redirects?: Record<string, string>;
  };
  config.redirects = { ...(config.redirects ?? {}), [`/posts/${from}/`]: `/posts/${to}/` };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { from: `/posts/${from}/`, to: `/posts/${to}/` };
}
