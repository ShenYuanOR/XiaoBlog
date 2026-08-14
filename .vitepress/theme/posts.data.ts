import { createContentLoader } from 'vitepress'

export interface PostSummary {
  title: string
  slug: string
  date: string
  updated?: string
  description: string
  tags: string[]
  category?: string
  cover?: string
  layout: string
  url: string
  headers: { level: number; title: string; slug: string }[]
}

export default createContentLoader('posts/*.md', {
  transform(raw): PostSummary[] {
    return raw
      .filter((p) => !p.frontmatter.draft)
      .sort((a, b) => String(b.frontmatter.date).localeCompare(String(a.frontmatter.date)))
      .map((p) => ({
        title: p.frontmatter.title as string,
        slug: p.frontmatter.slug as string,
        date: p.frontmatter.date as string,
        updated: p.frontmatter.updated as string | undefined,
        description: p.frontmatter.description as string,
        tags: (p.frontmatter.tags as string[]) ?? [],
        category: p.frontmatter.category as string | undefined,
        cover: p.frontmatter.cover as string | undefined,
        layout: (p.frontmatter.layout as string) ?? 'essay',
        url: p.url,
        headers: (p.headers as PostSummary['headers']) ?? [],
      }))
  },
})
