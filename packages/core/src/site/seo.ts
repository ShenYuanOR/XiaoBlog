import { absoluteUrl } from './url.ts';

export interface HeadEntry {
  tag: 'link' | 'meta' | 'script' | 'title';
  attrs?: Record<string, string>;
  children?: string;
}

export interface SeoAuthor {
  name: string;
  avatar?: string;
}

export interface SeoPostInput {
  url: string;
  title: string;
  description: string;
  date: string;
  updated?: string;
  category?: string;
  tags?: string[];
  cover?: string;
}

export function baseHead(title: string, description: string): HeadEntry[] {
  return [
    { tag: 'title', children: title },
    { tag: 'meta', attrs: { name: 'description', content: description } },
  ];
}

export function canonicalHead(href: string): HeadEntry[] {
  return [{ tag: 'link', attrs: { rel: 'canonical', href } }];
}

export function openGraphHead(siteTitle: string, post: SeoPostInput, siteUrl: string): HeadEntry[] {
  const entries: HeadEntry[] = [
    { tag: 'meta', attrs: { property: 'og:type', content: 'article' } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: siteTitle } },
    { tag: 'meta', attrs: { property: 'og:title', content: post.title } },
    { tag: 'meta', attrs: { property: 'og:description', content: post.description } },
    { tag: 'meta', attrs: { property: 'og:url', content: post.url } },
    { tag: 'meta', attrs: { property: 'article:published_time', content: post.date } },
  ];
  if (post.updated) {
    entries.push({
      tag: 'meta',
      attrs: { property: 'article:modified_time', content: post.updated },
    });
  }
  if (post.tags?.length) {
    entries.push({ tag: 'meta', attrs: { property: 'article:tag', content: post.tags.join(',') } });
  }
  if (post.cover) {
    entries.push({
      tag: 'meta',
      attrs: { property: 'og:image', content: absoluteUrl(siteUrl, post.cover) },
    });
  }
  return entries;
}

export function twitterCardHead(post: SeoPostInput, siteUrl: string): HeadEntry[] {
  const entries: HeadEntry[] = [
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', attrs: { name: 'twitter:title', content: post.title } },
    { tag: 'meta', attrs: { name: 'twitter:description', content: post.description } },
  ];
  if (post.cover) {
    entries.push({
      tag: 'meta',
      attrs: { name: 'twitter:image', content: absoluteUrl(siteUrl, post.cover) },
    });
  }
  return entries;
}

export function blogPostingJsonLd(
  post: SeoPostInput,
  author: SeoAuthor,
  siteUrl: string,
): HeadEntry[] {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url: post.url,
    mainEntityOfPage: post.url,
    datePublished: post.date,
    ...(post.updated ? { dateModified: post.updated } : {}),
    ...(post.category ? { articleSection: post.category } : {}),
    keywords: post.tags?.join(', ') ?? '',
    author: {
      '@type': 'Person',
      name: author.name,
      ...(author.avatar ? { image: absoluteUrl(siteUrl, author.avatar) } : {}),
    },
    ...(post.cover ? { image: absoluteUrl(siteUrl, post.cover) } : {}),
  };
  return [
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify(data),
    },
  ];
}

export function websiteJsonLd(name: string, url: string, description: string): HeadEntry[] {
  return [
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name,
        url,
        description,
      }),
    },
  ];
}
