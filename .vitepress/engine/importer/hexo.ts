import { join, dirname } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { parseFrontmatter } from '../posts.ts'
import { toWallClock, slugFromFile, slugFromTitle, resolveImages, DATE_RE } from './common.ts'
import type { MigratedPost, MigrationSource } from './types.ts'

/**
 * Hexo 适配器。
 * 结构：<root>/source/_posts/*.md；图片通常为同目录相对引用或 /images/ 绝对路径
 * slug：frontmatter 无 slug，URL 由 permalink 决定——此处以文件名派生，报告需人工确认
 */
export function scanHexo(source: MigrationSource): MigratedPost[] {
  const posts: MigratedPost[] = []
  let files: string[] = []
  try {
    files = readdirSync(source.postsDir).filter((f) => f.endsWith('.md'))
  } catch {
    return posts
  }

  for (const file of files) {
    const mdPath = join(source.postsDir, file)
    const raw = readFileSync(mdPath, 'utf-8')
    const { data, content } = parseFrontmatter(raw)
    const issues: string[] = []

    const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : ''
    if (!title) issues.push('缺 title')

    const date = toWallClock(data.date)
    if (!date || !DATE_RE.test(date)) issues.push(`date 缺失或非法: ${String(data.date)}`)

    const fileBase = file.replace(/\.md$/, '')
    const fileSlug = slugFromFile(fileBase)
    const titleSlug = title ? slugFromTitle(title) : ''
    const slug = fileSlug || titleSlug

    const tags = Array.isArray(data.tags) ? data.tags.map((t: unknown) => String(t)).filter(Boolean) : []
    const category = typeof data.categories === 'string' ? data.categories
      : Array.isArray(data.categories) ? String(data.categories[0] ?? '')
      : undefined

    const description = typeof data.description === 'string' && data.description.trim() ? data.description.trim() : undefined
    if (!description) issues.push('缺 description（将由正文自动生成初稿）')

    const refs: string[] = []
    const re = /!\[[^\]]*\]\(([^)]+)\)/g
    for (const m of content.matchAll(re)) {
      const href = m[1].trim()
      if (!/^(https?:)?\/\//.test(href)) refs.push(href.split('#')[0].split('?')[0])
    }
    const images = resolveImages(refs, mdPath, source.publicDir)
    const missingImages = images.filter((i) => !i.exists).length
    if (missingImages > 0) issues.push(`${missingImages} 个图片引用文件缺失`)

    posts.push({
      title: title || fileBase,
      date: date || '1970-01-01 00:00:00',
      tags,
      category,
      description,
      slug,
      fileBase,
      content,
      images,
      issues,
    })
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : -1))
  return posts
}
