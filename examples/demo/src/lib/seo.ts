import { loadConfig } from './config';
import { withBase } from './base';

export interface HeadEntry {
  tag: 'meta' | 'link' | 'script';
  attrs?: Record<string, string>;
  children?: string;
}

export function articleHeads(post: {
  slug: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  tags?: string[];
  noindex?: boolean;
}): HeadEntry[] {
  const config = loadConfig();
  const path = withBase(`posts/${post.slug}/`);
  const url = new URL(path, config.site.url).href;
  const heads: HeadEntry[] = [
    { tag: 'link', attrs: { rel: 'canonical', href: url } },
    { tag: 'meta', attrs: { property: 'og:type', content: 'article' } },
    { tag: 'meta', attrs: { property: 'og:title', content: post.title } },
    { tag: 'meta', attrs: { property: 'og:description', content: post.description } },
    { tag: 'meta', attrs: { property: 'og:url', content: url } },
    { tag: 'meta', attrs: { property: 'article:published_time', content: post.date } },
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', attrs: { name: 'twitter:title', content: post.title } },
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        url,
        datePublished: post.date,
        ...(post.updated ? { dateModified: post.updated } : {}),
        keywords: (post.tags ?? []).join(', '),
        author: { '@type': 'Person', name: config.author.name },
      }),
    },
  ];
  if (post.updated) {
    heads.push({
      tag: 'meta',
      attrs: { property: 'article:modified_time', content: post.updated },
    });
  }
  if (post.noindex || config.seo.noindex) {
    heads.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } });
  }
  return heads;
}

export function websiteHeads(): HeadEntry[] {
  const config = loadConfig();
  const url = new URL(withBase(), config.site.url).href;
  return [
    { tag: 'link', attrs: { rel: 'canonical', href: url } },
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: config.site.title,
        url,
        description: config.site.description,
      }),
    },
  ];
}
