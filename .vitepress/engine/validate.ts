import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { blog } from '../blog.config.ts'
import { isValidDate, isValidSlug, loadPosts, postDir, registeredLayouts } from './posts.ts'
import { normalizeRoute, postUrl } from './url.ts'
import type { PostData } from './types.ts'

export interface ValidationIssue {
  level: 'error' | 'warning'
  message: string
}

export function validatePosts(posts: PostData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const slugs = new Map<string, number>()

  for (const post of posts) {
    const fm = post.frontmatter
    const where = `${fm.slug} (${fm.title || '无标题'})`

    if (!fm.title) issues.push({ level: 'error', message: `缺 title：${fm.slug}` })
    if (!isValidSlug(fm.slug)) {
      issues.push({ level: 'error', message: `slug 不合法（需小写 ASCII 连字符）：${fm.slug}` })
    } else {
      slugs.set(fm.slug, (slugs.get(fm.slug) ?? 0) + 1)
    }
    if (!isValidDate(fm.date)) issues.push({ level: 'error', message: `date 缺失或格式非法：${where}` })
    if (fm.updated && !isValidDate(fm.updated)) {
      issues.push({ level: 'error', message: `updated 格式非法：${where}` })
    }
    if (fm.updated && fm.date && fm.updated.slice(0, 10) < fm.date.slice(0, 10)) {
      issues.push({ level: 'warning', message: `updated 早于 date：${where}` })
    }
    if (!fm.description) issues.push({ level: 'error', message: `缺 description：${where}` })
    if (!Array.isArray(fm.tags) || fm.tags.length === 0) {
      issues.push({ level: 'error', message: `缺 tags：${where}` })
    }
    if (fm.layout && !registeredLayouts().includes(fm.layout)) {
      issues.push({ level: 'error', message: `layout 未注册：${where} (${fm.layout})` })
    }
    if (fm.cover) {
      const coverPath = join(process.cwd(), 'public', fm.cover.replace(/^\//, ''))
      if (!existsSync(coverPath)) {
        issues.push({ level: 'error', message: `cover 文件不存在：${where} (${fm.cover})` })
      }
    }
    validateImages(post, issues)
    validateInternalLinks(post, issues)
  }

  for (const [slug, count] of slugs) {
    if (count > 1) issues.push({ level: 'error', message: `slug 重复（${count} 次）：${slug}` })
  }
  return issues
}

function imageRefs(content: string): { ref: string; file: string }[] {
  const out: { ref: string; file: string }[] = []
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g
  for (const m of content.matchAll(re)) {
    const href = m[2].trim()
    if (/^(https?:)?\/\//.test(href)) continue
    const file = href.split('#')[0].split('?')[0]
    if (!/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(file)) continue
    out.push({ ref: href, file })
  }
  return out
}

function validateImages(post: PostData, issues: ValidationIssue[]): void {
  const { slug, title } = post.frontmatter
  const where = `${slug} (${title})`
  const IMG_NAME_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*\.(png|jpe?g|gif|webp|svg|avif)$/i
  for (const { ref, file } of imageRefs(post.content)) {
    if (!file) continue
    const baseName = file.split('/').pop() ?? ''
    if (!IMG_NAME_RE.test(baseName)) {
      issues.push({ level: 'warning', message: `图片命名不规范（小写字母/数字/连字符/点）：${where} ${ref}` })
    }
    const abs = file.startsWith('/posts/')
      ? join(process.cwd(), 'public', file.replace(/^\//, ''))
      : join(postDir(), file)
    if (!existsSync(abs)) {
      issues.push({ level: 'error', message: `图片文件不存在：${where} ${ref}` })
    }
  }
}

function validateInternalLinks(post: PostData, issues: ValidationIssue[]): void {
  const { slug, title } = post.frontmatter
  const where = `${slug} (${title})`
  const posts = loadPosts({ includeDrafts: true })
  const known = new Set(posts.map((p) => normalizeRoute(p.route)))
  for (const name of ['archives', 'tags', 'categories', 'about', 'dev']) {
    known.add(normalizeRoute(`/${name}`))
  }
  try {
    for (const file of readdirSync(join(process.cwd(), 'docs')).filter((f) => f.endsWith('.md') && f !== 'index.md')) {
      known.add(normalizeRoute(`/${file.replace(/\.md$/, '')}`))
    }
    for (const file of readdirSync(join(process.cwd(), 'docs', 'dev')).filter((f) => f.endsWith('.md'))) {
      known.add(normalizeRoute(`/dev/${file.replace(/\.md$/, '')}`))
    }
  } catch {
    // docs 目录不存在时跳过
  }
  const re = /\[[^\]]*\]\(([^)]+)\)/g
  for (const m of post.content.matchAll(re)) {
    const href = m[1].trim()
    if (/^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('#') || /\.(png|jpe?g|gif|webp|svg|avif)([#?].*)?$/i.test(href)) continue
    const path = normalizeRoute(href.split('#')[0].split('?')[0])
    if (!known.has(path)) {
      issues.push({ level: 'error', message: `内部链接指向不存在的页面：${where} ${href}` })
    }
  }
}

export function validateBuild(distDir: string, routes: string[], posts: PostData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const locs = new Set<string>()
  for (const post of posts) {
    if (post.frontmatter.draft || post.frontmatter.noindex) continue
    if (locs.has(post.url)) issues.push({ level: 'error', message: `canonical 重复：${post.url}` })
    locs.add(post.url)
  }

  const built = new Set<string>()
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.html') && name !== '404.html') {
        built.add(relative(distDir, p).replace(/\\/g, '/'))
      }
    }
  }
  if (existsSync(distDir)) walk(distDir)

  for (const route of routes) {
    const base = (route === '/' ? 'index' : route.replace(/^\//, '').replace(/\/$/, '')) + '.html'
    if (!built.has(base) && !built.has(base.replace(/\.html$/, '/index.html'))) {
      issues.push({ level: 'error', message: `路由未产出 HTML：${route}` })
    }
  }
  return issues
}

export function validateRedirects(redirects: { from: string; to: string }[], posts: PostData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const targets = new Set([...posts.map((p) => normalizeRoute(p.route)), '/', '/archives', '/tags', '/categories'])
  const seen = new Set<string>()
  for (const r of redirects) {
    const from = normalizeRoute(r.from)
    const to = normalizeRoute(r.to)
    if (seen.has(from)) issues.push({ level: 'error', message: `redirects 重复源：${r.from}` })
    seen.add(from)
    if (!targets.has(to)) issues.push({ level: 'error', message: `redirects 目标不存在：${r.from} → ${r.to}` })
    if (from === to) issues.push({ level: 'error', message: `redirects 自环：${r.from}` })
  }
  return issues
}
