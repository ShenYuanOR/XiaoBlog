import { isValidSlug } from '@xiao/core/site';
import type { PostItem } from './content.ts';
import type { SiteConfig } from './settings.ts';

export interface SeoRow {
  level: 'error' | 'warn' | 'info';
  rule: string;
  detail: string;
}

/**
 * 显示宽度：汉字和全角算 2，其余算 1。
 * 与 packages/template/src/lib/seo-audit.mjs、apps/studio/src/renderer/src/views/Seo.vue 的 displayWidth 保持一致，改规则时三处一起改。
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width +=
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
        ? 2
        : 1;
  }
  return width;
}

export const SEO_RULE_LABELS: Record<string, string> = {
  'site-url-missing': '站点地址还没填',
  'site-url-placeholder': '站点地址还是占位',
  'slug-invalid': '地址标识不合法',
  'slug-duplicate': '地址标识重复',
  'title-too-long': '标题太长',
  'title-duplicate': '标题重复',
  'description-missing': '缺少摘要',
  'description-too-short': '摘要太短',
  'description-too-long': '摘要太长',
  'og-image-missing': '没有默认分享图',
  'post-tags-missing': '文章没有标签',
  'post-category-missing': '文章没有分类',
};

function placeholderUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'example.com' ||
      host.endsWith('.example.com') ||
      host === 'example.org' ||
      host === 'localhost'
    );
  } catch {
    return true;
  }
}

export function seoRows(config: SiteConfig, posts: PostItem[]): SeoRow[] {
  const rows: SeoRow[] = [];
  const url = config.site.url?.trim() ?? '';
  if (!url) {
    rows.push({ level: 'error', rule: 'site-url-missing', detail: '部署前必须填写站点地址' });
  } else if (placeholderUrl(url)) {
    rows.push({
      level: 'error',
      rule: 'site-url-placeholder',
      detail: `站点地址还是占位值：${url}`,
    });
  }
  const seen = new Map<string, number>();
  for (const post of posts) {
    seen.set(post.slug, (seen.get(post.slug) ?? 0) + 1);
    if (!isValidSlug(post.slug)) {
      rows.push({ level: 'error', rule: 'slug-invalid', detail: post.slug });
    }
  }
  for (const [slug, count] of seen) {
    if (count > 1) rows.push({ level: 'error', rule: 'slug-duplicate', detail: slug });
  }
  const titles = new Map<string, number>();
  for (const post of posts) {
    titles.set(post.title, (titles.get(post.title) ?? 0) + 1);
    if (displayWidth(post.title) > 60) {
      rows.push({
        level: 'warn',
        rule: 'title-too-long',
        detail: `${post.title}（显示宽度 ${displayWidth(post.title)}）`,
      });
    }
    if (!post.description) {
      rows.push({ level: 'warn', rule: 'description-missing', detail: post.title });
    } else {
      const width = displayWidth(post.description);
      if (width < 60) {
        rows.push({ level: 'warn', rule: 'description-too-short', detail: post.title });
      } else if (width > 160) {
        rows.push({ level: 'warn', rule: 'description-too-long', detail: post.title });
      }
    }
    if (post.tags.length === 0) {
      rows.push({ level: 'info', rule: 'post-tags-missing', detail: post.title });
    }
    if (!post.category || post.category === '未分类') {
      rows.push({ level: 'info', rule: 'post-category-missing', detail: post.title });
    }
  }
  for (const [title, count] of titles) {
    if (count > 1) rows.push({ level: 'warn', rule: 'title-duplicate', detail: title });
  }
  if (!config.site.ogImage?.trim()) {
    rows.push({ level: 'warn', rule: 'og-image-missing', detail: 'site.ogImage 为空' });
  }
  return rows;
}
