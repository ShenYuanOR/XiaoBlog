import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { annotateCodeBlocks, extractDescription, isValidSlug } from './common.ts';
import { scanHexo } from './hexo.ts';
import { scanValaxy } from './valaxy.ts';
import { scanXiao } from './xiao.ts';
import type {
  ApplyOptions,
  ApplyResult,
  MigratedPost,
  MigrationReport,
  MigrationSource,
} from './types.ts';

export function scan(source: MigrationSource): MigrationReport {
  const posts =
    source.name === 'valaxy'
      ? scanValaxy(source)
      : source.name === 'hexo'
        ? scanHexo(source)
        : scanXiao(source);
  const slugSeen = new Map<string, string>();
  const slugConflicts: string[] = [];
  for (const post of posts) {
    if (!isValidSlug(post.slug)) {
      slugConflicts.push(`${post.title}：slug「${post.slug}」不合法（仅小写 ASCII 连字符）`);
    }
    const previous = slugSeen.get(post.slug);
    if (previous)
      slugConflicts.push(`slug 冲突：「${post.slug}」同时用于「${previous}」与「${post.title}」`);
    slugSeen.set(post.slug, post.title);
  }
  return {
    sourceName: source.name,
    posts,
    slugConflicts,
    summary: {
      total: posts.length,
      missingDescription: posts.filter((post) => !post.description).length,
      missingImages: posts.reduce(
        (count, post) => count + post.images.filter((image) => !image.exists).length,
        0,
      ),
      slugChanged: posts.filter((post) => redirectSources(post).length > 0).length,
      redirects: 0,
    },
  };
}

function routeOf(path: string): string {
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.replace(/\/+$/, '') || '/';
}

function redirectSources(post: MigratedPost): string[] {
  if (post.draft) return [];
  const target = routeOf(`/posts/${post.slug}`);
  const sources = [...post.legacyPaths];
  if (post.oldUrl) {
    try {
      sources.push(new URL(post.oldUrl).pathname);
    } catch {
      /* 非法 URL 不登记 */
    }
  }
  return [...new Set(sources.map(routeOf).filter((from) => from !== target))];
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function renderPost(post: MigratedPost): string {
  let body = post.content;
  for (const image of post.images) {
    if (!image.exists) continue;
    body = body.replaceAll(`](${image.ref})`, `](./${image.destName})`);
  }
  const annotated = annotateCodeBlocks(body);
  if (annotated.annotated > 0) body = annotated.content;
  const tags = post.tags.length > 0 ? post.tags : ['未分类'];
  const lines = [
    '---',
    `title: ${yamlString(post.title)}`,
    `date: ${yamlString(post.date)}`,
    post.updated ? `updated: ${yamlString(post.updated)}` : null,
    `description: ${yamlString(post.description ?? extractDescription(body))}`,
    post.category ? `category: ${yamlString(post.category)}` : null,
    'tags:',
    ...tags.map((tag) => `  - ${yamlString(tag)}`),
    post.draft ? 'draft: true' : null,
    '---',
    '',
    body.trim(),
    '',
  ];
  return lines.filter((line) => line !== null).join('\n');
}

export function readRedirectRules(yml: string): { from: string; to: string }[] {
  if (/redirects:\s*\[\s*\]/.test(yml)) return [];
  const rules: { from: string; to: string }[] = [];
  const pattern = /from:\s*(\S+)\s*\r?\n\s*to:\s*(\S+)/g;
  for (const matched of yml.matchAll(pattern)) {
    rules.push({ from: matched[1] ?? '', to: matched[2] ?? '' });
  }
  return rules.filter((rule) => rule.from && rule.to);
}

/** 落成文件夹文章，并把旧路径合并进 xiao.config.json 的 redirects。 */
export function apply(report: MigrationReport, options: ApplyOptions): ApplyResult {
  if (!existsSync(options.configPath)) throw new Error(`找不到配置：${options.configPath}`);
  mkdirSync(options.contentDir, { recursive: true });
  const result: ApplyResult = { written: [], skipped: [], imagesCopied: 0, redirectsAdded: 0 };
  for (const post of report.posts) {
    const dir = join(options.contentDir, post.slug);
    const target = join(dir, 'index.md');
    if (existsSync(target)) {
      result.skipped.push(`${post.slug}（目标已存在）`);
      continue;
    }
    mkdirSync(dir, { recursive: true });
    for (const image of post.images) {
      if (!image.exists) continue;
      copyFileSync(image.src, join(dir, image.destName));
      result.imagesCopied += 1;
    }
    writeFileSync(target, renderPost(post), 'utf8');
    result.written.push(target);
  }

  const config = JSON.parse(readFileSync(options.configPath, 'utf8')) as {
    redirects?: Record<string, string>;
  };
  const redirects: Record<string, string> = { ...(config.redirects ?? {}) };
  const add = (from: string, to: string) => {
    const key = from.startsWith('/') ? from : `/${from}`;
    if (redirects[key]) return;
    redirects[key] = to;
    result.redirectsAdded += 1;
  };
  if (options.redirectsFile && existsSync(options.redirectsFile)) {
    for (const rule of readRedirectRules(readFileSync(options.redirectsFile, 'utf8')))
      add(rule.from, rule.to);
  }
  for (const post of report.posts) {
    for (const from of redirectSources(post)) add(from, `/posts/${post.slug}/`);
  }
  config.redirects = redirects;
  writeFileSync(options.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return result;
}

export { scanHexo, scanValaxy, scanXiao };
export type { ApplyOptions, ApplyResult, MigrationReport, MigrationSource };
