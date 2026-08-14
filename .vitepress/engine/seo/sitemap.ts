import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { site } from '../../site.config.ts'
import { urlOf } from '../url.ts'
import type { PostData } from '../types.ts'

export interface SitemapEntry {
  loc: string
  lastmod?: string
  priority?: number
}

export function buildSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''
      const priority = e.priority !== undefined ? `<priority>${e.priority.toFixed(1)}</priority>` : ''
      return `  <url><loc>${e.loc}</loc>${lastmod}${priority}</url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
}

export function sitemapEntries(posts: PostData[], extraRoutes: string[] = []): SitemapEntry[] {
  const now = new Date().toISOString()
  const home: SitemapEntry = { loc: urlOf('/'), lastmod: now, priority: 1.0 }
  const autos: SitemapEntry[] = extraRoutes.map((r) => ({ loc: urlOf(r), lastmod: now, priority: 0.7 }))
  const postEntries: SitemapEntry[] = posts
    .filter((p) => !p.frontmatter.draft && !p.frontmatter.noindex)
    .map((p) => {
      const date = p.frontmatter.updated ?? p.frontmatter.date
      let lastmod = date
      if (!date.includes('T')) {
        const d = new Date(date)
        if (!Number.isNaN(d.getTime())) lastmod = d.toISOString()
      }
      return {
        loc: p.url,
        lastmod,
        priority: 0.8,
      }
    })
  return [home, ...autos, ...postEntries]
}

export function writeSitemap(distDir: string, posts: PostData[], extraRoutes: string[] = []): void {
  const xml = buildSitemap(sitemapEntries(posts, extraRoutes))
  writeFileSync(join(distDir, 'sitemap.xml'), xml)
}

export { site }
