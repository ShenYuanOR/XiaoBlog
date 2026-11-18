import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * 文章双格式（spec article-redesign §3.0）：
 * - `src/content/posts/<slug>/index.md`：Markdown 文章（默认），走内容集合 + <Content/>。
 * - `src/content/posts/<slug>/index.html`：HTML 文章，正文按原样渲染（不走 Markdown），
 *   头部同样用 `---` frontmatter，元数据与 md 一致。
 * 两条来源在这里合并成统一的 PostEntry，列表/路由/归档/标签/分类/SEO/RSS 都只认这个结构。
 *
 * 注意：html 的 frontmatter 解析刻意保持「YAML 子集」——只支持本模板用到的
 * 字符串 / 布尔 / 整数 / 行内数组 / 块状数组，不引入 YAML 依赖（C-01）。
 * validate.mjs 里有一份只做必填项检查的轻量实现，改字段时两处一起改。
 */

export type PostFormat = 'md' | 'html';

export interface PostData {
  title: string;
  date: string;
  updated?: string;
  description?: string;
  category?: string;
  tags: string[];
  /** md 文章是 Astro 图片元数据；html 文章按 frontmatter 原样保留（模板目前不渲染封面）。 */
  cover?: unknown;
  draft: boolean;
  noindex: boolean;
  license?: string;
  /** 仅 HTML 文章：true 时正文自己成页，不套文章模板。 */
  standalone?: boolean;
}

export interface PostEntry {
  id: string;
  format: PostFormat;
  data: PostData;
  /** 阅读时长/摘要用的正文源：md 是 Markdown 源，html 是 frontmatter 之后的 HTML。 */
  body: string;
  /** 仅 md 文章有：用于 `<Content />` 渲染。 */
  entry?: CollectionEntry<'posts'>;
}

/** HTML 文章的原始文件（构建期由 Vite 以字符串内联，不新增依赖）。 */
const htmlSources = import.meta.glob<string>('/src/content/posts/**/index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const HTML_PREFIX = '/src/content/posts/';
const BLOCK_KEY_RE = /^([A-Za-z0-9_-]+):\s*$/;
const KEY_RE = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const LIST_ITEM_RE = /^\s+-\s+(.*)$/;

function scalar(text: string): string | boolean | number | string[] {
  const value = text.trim();
  if (!value) return '';
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((item) => String(scalar(item)))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

/** 拆出 `---` frontmatter 与正文；没有 frontmatter 时返回 null。 */
function splitFrontmatter(source: string): { raw: string; body: string } | null {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!match) return null;
  return { raw: match[1] ?? '', body: text.slice(match[0].length) };
}

/** 解析 frontmatter 的 YAML 子集（标量 / 行内数组 / 块状数组）。 */
function parseFrontmatter(raw: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const lines = raw.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const block = BLOCK_KEY_RE.exec(line);
    if (block) {
      const key = block[1] ?? '';
      const items: string[] = [];
      let next = index + 1;
      while (next < lines.length) {
        const item = LIST_ITEM_RE.exec(lines[next] ?? '');
        if (!item) break;
        items.push(String(scalar(item[1] ?? '')).trim());
        next += 1;
      }
      data[key] = items;
      index = next - 1;
      continue;
    }
    const entry = KEY_RE.exec(line);
    if (!entry) continue;
    data[entry[1] ?? ''] = scalar(entry[2] ?? '');
  }
  return data;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toPostData(raw: Record<string, unknown>): PostData {
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : typeof raw.tags === 'string' && raw.tags.trim()
      ? raw.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
  return {
    title: textOf(raw.title) ?? '',
    date: textOf(raw.date) ?? '',
    updated: textOf(raw.updated),
    description: textOf(raw.description),
    category: textOf(raw.category),
    tags,
    cover: raw.cover,
    draft: raw.draft === true,
    noindex: raw.noindex === true,
    license: textOf(raw.license),
    standalone: raw.standalone === true,
  };
}

/** 把 md 集合条目映射成统一结构；集合 schema 已经保证了字段类型。 */
function fromMarkdown(entry: CollectionEntry<'posts'>): PostEntry {
  const data = entry.data;
  return {
    id: entry.id,
    format: 'md',
    data: {
      title: data.title,
      date: data.date,
      updated: data.updated,
      description: data.description,
      category: data.category,
      tags: data.tags ?? [],
      cover: data.cover,
      draft: data.draft === true,
      noindex: data.noindex === true,
      license: data.license,
    },
    body: typeof entry.body === 'string' ? entry.body : '',
    entry,
  };
}

function idFromKey(key: string): string {
  const normalized = key.replace(/\\/g, '/');
  const relative = normalized.startsWith(HTML_PREFIX)
    ? normalized.slice(HTML_PREFIX.length)
    : normalized.replace(/^.*\/content\/posts\//, '');
  return relative.replace(/\/index\.html$/, '');
}

/** 与 content.config.ts 的 date 规则一致；html 文章在读取时就报出可读错误。 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/;

/** 解析一篇 HTML 文章；frontmatter 缺失或必填项不对时直接抛出可读错误（构建会失败）。 */
function fromHtml(key: string, source: string): PostEntry {
  const id = idFromKey(key);
  const split = splitFrontmatter(source);
  if (!split) {
    throw new Error(
      `文章 ${id} 的 index.html 缺少 --- frontmatter 头部：需要 title 与 date（例如 date: '2026-09-12'）。`,
    );
  }
  const data = toPostData(parseFrontmatter(split.raw));
  if (!data.title) {
    throw new Error(`文章 ${id} 的 index.html frontmatter 缺少 title。`);
  }
  if (!DATE_RE.test(data.date)) {
    throw new Error(
      `文章 ${id} 的 index.html frontmatter date 格式不对：${data.date || '(空)'}；应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss。`,
    );
  }
  return {
    id,
    format: 'html',
    data,
    body: split.body,
  };
}

/** 全部文章（md + html，含草稿）。同 id 同时存在两种格式时 md 优先（validate 会报错拦构建）。 */
export async function allPosts(): Promise<PostEntry[]> {
  const markdown = (await getCollection('posts')).map(fromMarkdown);
  const ids = new Set(markdown.map((post) => post.id));
  const html = Object.entries(htmlSources)
    .map(([key, source]) => fromHtml(key, source))
    .filter((post) => !ids.has(post.id));
  return [...markdown, ...html].sort((a, b) => (a.data.date < b.data.date ? 1 : -1));
}

export async function publishedPosts(): Promise<PostEntry[]> {
  const posts = await allPosts();
  return posts.filter((post) => post.data.draft !== true);
}

export function neighbors(
  posts: PostEntry[],
  slug: string,
): { prev?: PostEntry; next?: PostEntry } {
  const index = posts.findIndex((post) => post.id === slug);
  return {
    prev: index > 0 ? posts[index - 1] : undefined,
    next: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

export function categoriesOf(posts: PostEntry[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    if (!post.data.category) continue;
    counts.set(post.data.category, (counts.get(post.data.category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

/** 侧栏「站点信息」与窄屏页脚共用的可计算数据；不含访问量这类没有数据源的数字。 */
export function siteFacts(
  posts: PostEntry[],
  since: number,
): { words: number; days: number; latest?: string } {
  const start = Number(since) || new Date().getFullYear();
  return {
    words: posts.reduce((sum, post) => sum + post.body.replace(/\s+/g, '').length, 0),
    days: Math.max(0, Math.floor((Date.now() - new Date(start, 0, 1).getTime()) / 86400000)),
    latest: posts
      .map((post) => (post.data.updated ?? post.data.date).slice(0, 10))
      .sort()
      .at(-1),
  };
}

export function readingMinutes(text: string): number {
  const count = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(count / 400));
}

export function tagsOf(posts: PostEntry[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}
