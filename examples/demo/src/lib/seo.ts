import { withBase } from './base';
import { loadConfig, titleOf, type XiaoConfig } from './config';

export interface HeadEntry {
  tag: 'meta' | 'link' | 'script';
  attrs?: Record<string, string>;
  children?: string;
}

export type PageKind = 'home' | 'article' | 'page';

export interface PageHeadInput {
  kind: PageKind;
  /** 站内路径，如 /posts/hello/。 */
  path: string;
  title: string;
  description?: string;
  /** 文章封面或页面分享图。没传时用 site.ogImage，都没有就不输出 og:image。 */
  image?: string;
  date?: string;
  updated?: string;
  tags?: string[];
  category?: string;
  noindex?: boolean;
}

/** 去掉 Markdown / HTML 后取约 80 个字，只给没写摘要的文章做 SEO description。 */
export function excerptFromBody(body: string, limit = 80): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, limit).join('').trim();
}

function absoluteUrl(siteUrl: string, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalized, siteUrl).href;
}

function absoluteAsset(siteUrl: string, src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/')) return new URL(src, siteUrl).href;
  return new URL(withBase(src), siteUrl).href;
}

function twitterHandle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function localeOf(lang: string): string {
  return lang.trim().replaceAll('-', '_') || 'zh_CN';
}

/** 全站唯一的 SEO 标签入口。 */
export function pageHeads(input: PageHeadInput, config: XiaoConfig = loadConfig()): HeadEntry[] {
  const url = absoluteUrl(config.site.url, input.path);
  const title = titleOf(input.kind === 'home' ? config.site.title : input.title, config);
  const description = (input.description || config.site.description || '').trim();
  const imageSrc = (input.image || config.site.ogImage || '').trim();
  const image = imageSrc ? absoluteAsset(config.site.url, imageSrc) : '';
  const siteName = twitterHandle(config.seo.twitter);
  const heads: HeadEntry[] = [
    { tag: 'link', attrs: { rel: 'canonical', href: url } },
    {
      tag: 'meta',
      attrs: { property: 'og:type', content: input.kind === 'article' ? 'article' : 'website' },
    },
    { tag: 'meta', attrs: { property: 'og:site_name', content: config.site.title } },
    { tag: 'meta', attrs: { property: 'og:title', content: title } },
    { tag: 'meta', attrs: { property: 'og:description', content: description } },
    { tag: 'meta', attrs: { property: 'og:url', content: url } },
    { tag: 'meta', attrs: { property: 'og:locale', content: localeOf(config.site.lang) } },
    {
      tag: 'meta',
      attrs: { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' },
    },
    { tag: 'meta', attrs: { name: 'twitter:title', content: title } },
    { tag: 'meta', attrs: { name: 'twitter:description', content: description } },
  ];
  if (image) {
    heads.push({ tag: 'meta', attrs: { property: 'og:image', content: image } });
    heads.push({ tag: 'meta', attrs: { name: 'twitter:image', content: image } });
  }
  if (siteName) {
    heads.push({ tag: 'meta', attrs: { name: 'twitter:site', content: siteName } });
  }
  if (input.kind === 'article') {
    if (input.date) {
      heads.push({
        tag: 'meta',
        attrs: { property: 'article:published_time', content: input.date },
      });
    }
    if (input.updated) {
      heads.push({
        tag: 'meta',
        attrs: { property: 'article:modified_time', content: input.updated },
      });
    }
    if (input.category) {
      heads.push({ tag: 'meta', attrs: { property: 'article:section', content: input.category } });
    }
    const author = config.author.name.trim() || config.site.title;
    if (author) {
      heads.push({ tag: 'meta', attrs: { property: 'article:author', content: author } });
    }
    for (const tag of input.tags ?? []) {
      if (tag.trim()) heads.push({ tag: 'meta', attrs: { property: 'article:tag', content: tag } });
    }
    heads.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: title,
        description,
        url,
        ...(image ? { image } : {}),
        ...(input.date ? { datePublished: input.date } : {}),
        ...(input.updated ? { dateModified: input.updated } : {}),
        ...(input.category ? { articleSection: input.category } : {}),
        keywords: (input.tags ?? []).join(', '),
        author: { '@type': 'Person', name: author },
        publisher: { '@type': 'Organization', name: config.site.title },
      }),
    });
  }
  if (input.kind === 'home') {
    heads.push({
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: config.site.title,
        url,
        description,
      }),
    });
  }
  if (input.noindex || config.seo.noindex) {
    heads.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } });
  }
  return heads;
}

export function articleHeads(post: {
  slug: string;
  title: string;
  description?: string;
  date: string;
  updated?: string;
  tags?: string[];
  category?: string;
  image?: string;
  noindex?: boolean;
  body?: string;
}): HeadEntry[] {
  return pageHeads({
    kind: 'article',
    path: withBase(`posts/${post.slug}/`),
    title: post.title,
    description: post.description?.trim() || (post.body ? excerptFromBody(post.body) : ''),
    image: post.image,
    date: post.date,
    updated: post.updated,
    tags: post.tags,
    category: post.category,
    noindex: post.noindex,
  });
}

export function websiteHeads(): HeadEntry[] {
  const config = loadConfig();
  return pageHeads({
    kind: 'home',
    path: withBase(),
    title: config.site.title,
    description: config.site.description,
  });
}
