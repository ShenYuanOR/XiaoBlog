import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { isValidSlug, slugFromTitle } from '@xiao/core/site';

/** 文章正文格式：Markdown（index.md）或 HTML（index.html），二选一，同一目录只放一个。 */
export type ContentFormat = 'markdown' | 'html';

export interface PostItem {
  slug: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  draft: boolean;
  date: string;
  cover: string;
  format: ContentFormat;
}

export interface PostContent {
  text: string;
  format: ContentFormat;
}

/** 新建接口的兼容形态：主进程 handler 目前只转发 3 个参数。 */
export interface CreatePostOptions {
  category?: string;
  format?: ContentFormat;
}

const FORMAT_FILE: Record<ContentFormat, string> = {
  markdown: 'index.md',
  html: 'index.html',
};

function postsRoot(siteDir: string): string {
  return path.join(siteDir, 'src', 'content', 'posts');
}

function postDir(siteDir: string, slug: string): string {
  return path.join(postsRoot(siteDir), slug);
}

function postFile(siteDir: string, slug: string, format: ContentFormat): string {
  return path.join(postDir(siteDir, slug), FORMAT_FILE[format]);
}

function resolveFormat(value: unknown): ContentFormat {
  return value === 'html' ? 'html' : 'markdown';
}

function existsSync(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** 先 md 后 html；两个都不存在时返回 null（列表里跳过这种目录）。 */
export function detectPostFormat(siteDir: string, slug: string): ContentFormat | null {
  if (existsSync(postFile(siteDir, slug, 'markdown'))) return 'markdown';
  if (existsSync(postFile(siteDir, slug, 'html'))) return 'html';
  return null;
}

/**
 * 切 frontmatter：与 @xiao/core/markdown 的 splitFrontmatter 同规则，
 * 但这里不引 Markdown 解析器，避免主进程为读列表加载 remark。
 * 注意正文里的 `---` 不会被误判：只认文件最开头到第一组 `---\n…---\n`。
 */
function splitFrontmatter(source: string): { fmRaw: string; body: string } {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  if (!match || !source.startsWith('---')) return { fmRaw: '', body: source };
  return { fmRaw: match[0], body: source.slice(match[0].length) };
}

/** 拆分结果对外暴露一份：列表/editor 之外的地方（含 node 自检）也用它判断 frontmatter。 */
export function splitPostFrontmatter(source: string): { fmRaw: string; body: string } {
  return splitFrontmatter(source);
}

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 不是合法 JSON 的 YAML 转义，退回手工去引号。
    }
    return value.slice(1, -1);
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function scalarField(frontmatter: string, key: string): string {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(frontmatter);
  return match?.[1] === undefined ? '' : unquote(match[1]);
}

/** tags 支持内联 `tags: ["a", "b"]` 和块列表 `tags:\n  - a` 两种写法。 */
function parseTags(frontmatter: string): string[] {
  const inline = new RegExp(`^tags:[ \\t]*\\[(.*)\\][ \\t]*$`, 'm').exec(frontmatter);
  if (inline) {
    const body = inline[1] ?? '';
    const rows = body.match(/"[^"]*"|'[^']*'|[^,]+/g) ?? [];
    return rows
      .map((row) => unquote(row.trim()))
      .map((row) => row.trim())
      .filter(Boolean);
  }
  const block = new RegExp(`^tags:[ \\t]*\\r?\\n((?:[ \\t]+-[^\\r\\n]*(?:\\r?\\n|$))*)`, 'm').exec(
    frontmatter,
  );
  if (!block) return [];
  return (block[1] ?? '')
    .split(/\r?\n/)
    .map((line) => /^[ \t]+-[ \t]*(.*)$/.exec(line)?.[1] ?? '')
    .map((row) => unquote(row.trim()))
    .filter(Boolean);
}

/** 从原文解析列表/检查器需要的 frontmatter 元数据（纯函数，便于 node 用例）。 */
export function parsePostMeta(raw: string, slug: string, format: ContentFormat): PostItem {
  const { fmRaw } = splitFrontmatter(raw);
  return {
    slug,
    title: scalarField(fmRaw, 'title') || slug,
    category: scalarField(fmRaw, 'category'),
    description: scalarField(fmRaw, 'description'),
    tags: parseTags(fmRaw),
    draft: /^draft:[ \t]*true[ \t]*$/m.test(fmRaw),
    date: scalarField(fmRaw, 'date'),
    cover: scalarField(fmRaw, 'cover'),
    format,
  };
}

function readPostMeta(siteDir: string, slug: string, format: ContentFormat): PostItem {
  return parsePostMeta(readFileSync(postFile(siteDir, slug, format), 'utf8'), slug, format);
}

/** IPC content:read 的实现：返回正文全文与格式（格式由实际存在的文件决定）。 */
export function readPostFile(siteDir: string, slug: string): PostContent {
  const format = detectPostFormat(siteDir, slug);
  if (!format) {
    throw new Error('找不到这篇文章：index.md 和 index.html 都不存在');
  }
  return { text: readFileSync(postFile(siteDir, slug, format), 'utf8'), format };
}

/** 写盘；不传 format 时按现有文件自动探测（Markdown 优先）。 */
export function writePostFile(
  siteDir: string,
  slug: string,
  content: string,
  format?: ContentFormat,
): ContentFormat {
  const target = resolveFormat(format ?? detectPostFormat(siteDir, slug) ?? 'markdown');
  writeFileSync(postFile(siteDir, slug, target), content);
  return target;
}

export function saveImage(siteDir: string, slug: string, name: string, bytes: Uint8Array): string {
  const dir = postDir(siteDir, slug);
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

export function listPosts(siteDir: string): PostItem[] {
  const root = postsRoot(siteDir);
  let names: string[] = [];
  try {
    names = readdirSync(root).filter((name) => {
      try {
        return statSync(path.join(root, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
  const rows: PostItem[] = [];
  for (const slug of names) {
    if (slug === '.xiao-recycle') continue;
    const format = detectPostFormat(siteDir, slug);
    if (!format) continue;
    try {
      rows.push(readPostMeta(siteDir, slug, format));
    } catch {
      // 某个目录读失败（权限/坏文件）时跳过，不要让整张列表挂掉。
    }
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

function stampNow(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 00:00:00`;
}

/** Markdown 新文章正文留空；HTML 新文章给一个可渲染的最小骨架。 */
function createPostBody(format: ContentFormat): string {
  if (format === 'html') {
    return '<article class="x-post">\n  <p>正文从这里开始…</p>\n</article>\n';
  }
  return '';
}

/**
 * 新建文章。
 * 主进程 `content:create` handler 目前只转发 (siteDir, title, category)；
 * 为了不丢 format，preload 在 HTML 时把 category 位置传成 `{ category, format }`，
 * 这里两种入参都接受，将来 handler 补第 4 个参数时可直接透传。
 */
export function createPost(
  siteDir: string,
  title: string,
  category: string | CreatePostOptions,
  format: ContentFormat = 'markdown',
): PostItem {
  const input: CreatePostOptions = typeof category === 'string' ? { category } : (category ?? {});
  const targetFormat = resolveFormat(input.format ?? format);
  const categoryName = (input.category ?? '').trim();
  const slug = slugFromTitle(title.trim() || 'note');
  const safe = isValidSlug(slug) ? slug : `note-${Date.now().toString(36)}`;
  const dir = postDir(siteDir, safe);
  mkdirSync(dir, { recursive: true });
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title.trim() || safe)}`,
    `date: ${JSON.stringify(stampNow())}`,
    categoryName ? `category: ${JSON.stringify(categoryName)}` : null,
    'description: ""',
    'draft: true',
    '---',
    '',
    createPostBody(targetFormat),
  ]
    .filter((line) => line !== null)
    .join('\n');
  writeFileSync(postFile(siteDir, safe, targetFormat), frontmatter);
  return readPostMeta(siteDir, safe, targetFormat);
}

/** 布局从 src/layouts 拷到 src/layouts/posts 时，相对路径要再往上走一层。 */
export function deepenRelativeSpecifier(spec: string): string {
  if (spec.startsWith('./')) return `.${spec}`;
  if (spec.startsWith('../')) return `../${spec}`;
  return spec;
}

export function rewriteCopiedLayout(source: string): string {
  return source.replace(
    /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    (_whole, start, spec, end) => `${start}${deepenRelativeSpecifier(spec)}${end}`,
  );
}

export function customizePost(siteDir: string, slug: string): string {
  if (!isValidSlug(slug)) throw new Error('slug 只允许小写字母、数字和连字符');
  const relative = `src/layouts/posts/${slug}.astro`;
  const dest = path.join(siteDir, 'src', 'layouts', 'posts', `${slug}.astro`);
  if (!existsSync(dest)) {
    const source = path.join(siteDir, 'src', 'layouts', 'PostLayout.astro');
    if (!existsSync(source)) {
      throw new Error('站点模板里没有 src/layouts/PostLayout.astro，没法复制出自定义版式');
    }
    const raw = readFileSync(source, 'utf8');
    // 版式必须保留正文插槽，否则文章内容会消失；默认模板应自带 <slot />。
    if (!/<slot\b/.test(raw)) {
      throw new Error('默认版式 PostLayout.astro 里没有 <slot />，先在源码里补上正文插槽再自定义');
    }
    const copied = rewriteCopiedLayout(raw);
    if (!/<slot\b/.test(copied)) {
      throw new Error('复制默认版式时丢了 <slot />，已取消生成');
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, copied);
  }
  // 统一返回正斜杠相对路径：渲染层用 session.activePage + safePage 处理，不能是 Windows 反斜杠。
  return relative;
}

export function readLayoutComparison(
  siteDir: string,
  slug: string,
): { custom: boolean; defaultText: string; customText: string; file: string } {
  if (!isValidSlug(slug)) throw new Error('slug 只允许小写字母、数字和连字符');
  const base = path.join(siteDir, 'src', 'layouts', 'PostLayout.astro');
  const custom = path.join(siteDir, 'src', 'layouts', 'posts', `${slug}.astro`);
  if (!existsSync(base)) throw new Error('站点模板里没有 src/layouts/PostLayout.astro');
  return {
    custom: existsSync(custom),
    defaultText: readFileSync(base, 'utf8'),
    customText: existsSync(custom) ? readFileSync(custom, 'utf8') : '',
    file: `src/layouts/posts/${slug}.astro`,
  };
}

export function resetPostLayout(siteDir: string, slug: string): { backup: string } {
  if (!isValidSlug(slug)) throw new Error('slug 只允许小写字母、数字和连字符');
  const custom = path.join(siteDir, 'src', 'layouts', 'posts', `${slug}.astro`);
  if (!existsSync(custom)) throw new Error('这篇没有自定义版式，已经在用默认版式');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRel = `.xiao/backups/layouts/${slug}-${stamp}.astro`;
  const backup = path.join(siteDir, backupRel);
  mkdirSync(path.dirname(backup), { recursive: true });
  copyFileSync(custom, backup);
  unlinkSync(custom);
  return { backup: backupRel };
}

export function deletePost(siteDir: string, slug: string): void {
  const from = postDir(siteDir, slug);
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
