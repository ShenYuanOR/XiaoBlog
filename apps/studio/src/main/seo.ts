import { isValidSlug } from '@xiao/core/site';
import type { PostItem } from './content.ts';
import type { SiteConfig } from './settings.ts';

export interface SeoRow {
  level: 'error' | 'warn' | 'info';
  rule: string;
  detail: string;
}

export function seoRows(config: SiteConfig, posts: PostItem[]): SeoRow[] {
  const rows: SeoRow[] = [];
  rows.push({
    level: config.site.url.trim() ? 'info' : 'error',
    rule: 'site.url 为空',
    detail: config.site.url.trim() ? '已填写' : '部署前必须填写',
  });
  const seen = new Map<string, number>();
  for (const post of posts) {
    seen.set(post.slug, (seen.get(post.slug) ?? 0) + 1);
    if (!isValidSlug(post.slug))
      rows.push({ level: 'error', rule: 'slug 非法', detail: post.slug });
  }
  for (const [slug, count] of seen) {
    if (count > 1) rows.push({ level: 'error', rule: 'slug 重复', detail: slug });
  }
  rows.push({ level: 'info', rule: '站内死链', detail: '构建后才能检查页面链接' });
  const titles = new Map<string, number>();
  for (const post of posts) {
    titles.set(post.title, (titles.get(post.title) ?? 0) + 1);
    if (post.title.length > 60)
      rows.push({ level: 'warn', rule: 'title 超过 60 字', detail: post.title });
    if (!post.description)
      rows.push({ level: 'warn', rule: '文章缺 description', detail: post.title });
    else if (post.description.length < 50 || post.description.length > 160) {
      rows.push({ level: 'warn', rule: 'description 长度不在 50 到 160', detail: post.title });
    }
    if (post.tags.length === 0)
      rows.push({ level: 'info', rule: '文章无标签', detail: post.title });
  }
  for (const [title, count] of titles) {
    if (count > 1) rows.push({ level: 'warn', rule: 'title 重复', detail: title });
  }
  rows.push({
    level: config.site.ogImage?.trim() ? 'info' : 'warn',
    rule: '未设置默认分享图',
    detail: config.site.ogImage?.trim() ? '已设置' : 'site.ogImage 为空',
  });
  for (const post of posts) {
    if (!post.category || post.category === '未分类') {
      rows.push({ level: 'info', rule: '文章无分类', detail: post.title });
    }
  }
  rows.push({ level: 'info', rule: '图片缺 alt 或超过 2 MB', detail: '构建后检查' });
  return rows;
}
