import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { site } from '../../site.config.ts'
import { urlOf } from '../url.ts'
import type { PostData } from '../types.ts'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildAtomFeed(posts: PostData[], feedUrl: string, selfUrl: string): string {
  const updated = posts[0]?.frontmatter.updated ?? posts[0]?.frontmatter.date ?? new Date().toISOString()
  const entries = posts
    .filter((p) => !p.frontmatter.draft && !p.frontmatter.noindex)
    .map((p) => {
      const fm = p.frontmatter
      const published = new Date(fm.date).toISOString()
      const modified = fm.updated ? new Date(fm.updated).toISOString() : published
      return `  <entry>\n    <title>${escapeXml(fm.title)}</title>\n    <link href="${p.url}"/>\n    <id>${p.url}</id>\n    <published>${published}</published>\n    <updated>${modified}</updated>\n    <author><name>${escapeXml(site.author.name)}</name></author>\n    <summary>${escapeXml(fm.description)}</summary>\n  </entry>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n  <title>${escapeXml(site.title)}</title>\n  <subtitle>${escapeXml(site.subtitle ?? '')}</subtitle>\n  <link href="${selfUrl}" rel="self"/>\n  <link href="${urlOf('/')}"/>\n  <updated>${updated}</updated>\n  <id>${feedUrl}</id>\n${entries}\n</feed>\n`
}

export function writeFeeds(distDir: string, posts: PostData[]): void {
  const feedUrl = urlOf('/atom.xml')
  const xml = buildAtomFeed(posts, feedUrl, feedUrl)
  writeFileSync(join(distDir, 'atom.xml'), xml)
}
