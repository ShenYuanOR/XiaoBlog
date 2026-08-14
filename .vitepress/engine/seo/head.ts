import { site } from '../../site.config.ts'
import { urlOf } from '../url.ts'

export interface HeadEntry {
  tag: 'link' | 'meta' | 'script' | 'title'
  attrs?: Record<string, string>
  children?: string
}

interface SeoPost {
  url: string
  frontmatter: {
    title: string
    description: string
    cover?: string
    date: string
    updated?: string
    category?: string
    tags?: string[]
  }
}

export function baseHead(title: string, description: string): HeadEntry[] {
  return [
    { tag: 'title', children: title },
    { tag: 'meta', attrs: { name: 'description', content: description } },
    { tag: 'meta', attrs: { name: 'generator', content: '晓' } },
  ]
}

export function openGraphHead(post: SeoPost): HeadEntry[] {
  const { title, description } = post.frontmatter
  return [
    { tag: 'meta', attrs: { property: 'og:type', content: 'article' } },
    { tag: 'meta', attrs: { property: 'og:site_name', content: site.title } },
    { tag: 'meta', attrs: { property: 'og:title', content: title } },
    { tag: 'meta', attrs: { property: 'og:description', content: description } },
    { tag: 'meta', attrs: { property: 'og:url', content: post.url } },
    ...(post.frontmatter.cover
      ? [{ tag: 'meta', attrs: { property: 'og:image', content: urlOf(post.frontmatter.cover) } } as HeadEntry]
      : []),
  ]
}

export function twitterCardHead(post: SeoPost): HeadEntry[] {
  return [
    { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
    { tag: 'meta', attrs: { name: 'twitter:title', content: post.frontmatter.title } },
    { tag: 'meta', attrs: { name: 'twitter:description', content: post.frontmatter.description } },
    ...(post.frontmatter.cover
      ? [{ tag: 'meta', attrs: { name: 'twitter:image', content: urlOf(post.frontmatter.cover) } } as HeadEntry]
      : []),
  ]
}

export function canonicalHead(route: string): HeadEntry[] {
  return [{ tag: 'link', attrs: { rel: 'canonical', href: urlOf(route) } }]
}

export function noindexHead(): HeadEntry[] {
  return [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }]
}

export function blogPostingJsonLd(post: SeoPost): HeadEntry[] {
  const fm = post.frontmatter
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: fm.title,
    description: fm.description,
    url: post.url,
    mainEntityOfPage: post.url,
    datePublished: fm.date,
    ...(fm.updated ? { dateModified: fm.updated } : {}),
    ...(fm.category ? { articleSection: fm.category } : {}),
    keywords: Array.isArray(fm.tags) ? fm.tags.join(', ') : '',
    author: {
      '@type': 'Person',
      name: site.author.name,
      ...(site.author.avatar ? { image: urlOf(site.author.avatar) } : {}),
    },
    publisher: {
      '@type': 'Person',
      name: site.author.name,
    },
    ...(fm.cover ? { image: urlOf(fm.cover) } : {}),
  }
  return [
    {
      tag: 'script',
      attrs: { type: 'application/ld+json' },
      children: JSON.stringify(data),
    },
  ]
}
