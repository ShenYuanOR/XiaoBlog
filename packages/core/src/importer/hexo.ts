import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DATE_RE,
  asStringList,
  asText,
  imageRefs,
  parseFrontmatter,
  resolveImages,
  slugFromFile,
  slugFromTitle,
  toWallClock,
} from './common.ts';
import type { MigratedPost, MigrationSource } from './types.ts';

/** Hexo：source/_posts/*.md。slug 由文件名派生，旧 URL 需要人工确认，因此不猜 oldUrl。 */
export function scanHexo(source: MigrationSource): MigratedPost[] {
  return readPosts(source, (fileBase, data, title) => {
    const fileSlug = slugFromFile(fileBase);
    const titleSlug = title ? slugFromTitle(title) : '';
    const slug = fileSlug || titleSlug;
    const category = asText(data.categories) || asStringList(data.categories)[0];
    return { slug, category, legacyPaths: [], oldUrl: undefined };
  });
}

export function readPosts(
  source: MigrationSource,
  identify: (
    fileBase: string,
    data: Record<string, unknown>,
    title: string,
  ) => { slug: string; category?: string; legacyPaths: string[]; oldUrl?: string },
): MigratedPost[] {
  let files: string[] = [];
  try {
    files = readdirSync(source.postsDir).filter((file) => file.endsWith('.md'));
  } catch {
    return [];
  }
  const posts: MigratedPost[] = [];
  for (const file of files) {
    const mdPath = join(source.postsDir, file);
    const raw = readFileSync(mdPath, 'utf8');
    const { data, content } = parseFrontmatter(raw);
    const issues: string[] = [];
    const title = asText(data.title);
    if (!title) issues.push('缺 title');
    const date = toWallClock(data.date);
    if (!date || !DATE_RE.test(date)) issues.push(`date 缺失或非法: ${String(data.date)}`);
    const fileBase = file.replace(/\.md$/, '');
    const identity = identify(fileBase, data, title);
    const tags = asStringList(data.tags);
    const description = asText(data.description) || undefined;
    if (!description) issues.push('缺 description（将由正文自动生成初稿）');
    const images = resolveImages(imageRefs(content), mdPath, source.publicDir, source.assetsDir);
    const missingImages = images.filter((image) => !image.exists).length;
    if (missingImages > 0) issues.push(`${missingImages} 个图片引用文件缺失`);
    const updated = toWallClock(data.updated) || undefined;
    posts.push({
      title: title || fileBase,
      date: date || '1970-01-01 00:00:00',
      updated: updated || undefined,
      tags,
      category: identity.category,
      description,
      draft: data.draft === true,
      slug: identity.slug,
      oldUrl: identity.oldUrl,
      legacyPaths: identity.legacyPaths,
      fileBase,
      content,
      images,
      issues,
    });
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts;
}
