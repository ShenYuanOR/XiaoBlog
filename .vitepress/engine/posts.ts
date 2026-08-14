import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { CORE_SCHEMA, load as parseYaml } from 'js-yaml'
import { blog } from '../blog.config.ts'
import { postUrl, urlOf } from './url.ts'
import type { PostData, PostFrontmatter } from './types.ts'

export interface LoadOptions {
  includeDrafts?: boolean
}

export function postDir(): string {
  return join(process.cwd(), 'docs', 'posts')
}

/**
 * 解析 frontmatter。使用 YAML CORE_SCHEMA：
 * 时间戳（如 2026-08-14 20:00:00）保持字符串，避免 js-yaml 按 UTC 解析成 Date 造成时区漂移。
 */
export function parseFrontmatter(raw: string): matter.GrayMatterFile<string> {
  return matter(raw, {
    engines: {
      yaml: (s) => parseYaml(s, { schema: CORE_SCHEMA }) as object,
    },
  })
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/

export function isValidSlug(slug: unknown): boolean {
  return typeof slug === 'string' && SLUG_RE.test(slug)
}

export function isValidDate(value: unknown): boolean {
  return typeof value === 'string' && DATE_RE.test(value)
}

export function toDateString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = value
    const pad = (n: number) => String(n).padStart(2, '0')
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return `${date} ${time}`
  }
  if (typeof value === 'string') return value
  return ''
}

export function loadPosts(options: LoadOptions = {}): PostData[] {
  const dir = postDir()
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'))
  } catch {
    return []
  }
  const posts: PostData[] = []
  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf-8')
    const { data, content } = parseFrontmatter(raw)
    const fm = data as Partial<PostFrontmatter>
    if (!fm.slug) continue
    if (fm.draft && !options.includeDrafts) continue
    const slug = fm.slug
    const date = toDateString(fm.date)
    const updated = fm.updated === undefined ? undefined : toDateString(fm.updated)
    posts.push({
      frontmatter: {
        title: fm.title ?? '',
        slug,
        date,
        description: fm.description ?? '',
        tags: fm.tags ?? [],
        updated,
        category: fm.category,
        cover: fm.cover,
        draft: fm.draft,
        noindex: fm.noindex,
        layout: fm.layout ?? 'essay',
        license: fm.license,
      },
      content,
      fileBase: file.replace(/\.md$/, ''),
      route: postUrl(slug),
      url: '',
    })
  }
  posts.sort((a, b) => (a.frontmatter.date < b.frontmatter.date ? 1 : -1))
  for (const p of posts) {
    p.url = urlOf(postUrl(p.frontmatter.slug))
  }
  return posts
}

export function getPost(slug: string): PostData | undefined {
  return loadPosts({ includeDrafts: true }).find((p) => p.frontmatter.slug === slug)
}

export function registeredLayouts(): string[] {
  return blog.layoutVariants.map((v) => v.name)
}
