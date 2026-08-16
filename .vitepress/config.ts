import { defineConfig } from 'vitepress'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { site } from './site.config.ts'
import { collectAssets } from './engine/assets.ts'
import { syncTimestamps } from './engine/timestamps.ts'
import { loadRedirects, findRedirect, syncRedirectFiles } from './engine/redirects.ts'
import { registerBuiltinAutoPages, buildAutoPagesData, autoPageRoutes } from './engine/automata.ts'
import { loadPosts, parseFrontmatter } from './engine/posts.ts'
import { validatePosts, validateBuild } from './engine/validate.ts'
import { writeSitemap } from './engine/seo/sitemap.ts'
import { writeFeeds } from './engine/seo/rss.ts'
import { writeRobots } from './engine/seo/robots.ts'
import {
  baseHead,
  openGraphHead,
  twitterCardHead,
  canonicalHead,
  noindexHead,
  blogPostingJsonLd,
} from './engine/seo/head.ts'
import { postUrl, siteBase } from './engine/url.ts'
import type { HeadEntry } from './engine/seo/head.ts'

/** 部署路径前缀：默认 /；仅 site.config 显式配置 base 时才有子路径 */
const base = siteBase()

function toHeadEntries(entries: HeadEntry[]): unknown[] {
  return entries.map((e) =>
    e.tag === 'title'
      ? ['title', {}, e.children ?? ''] as [string, Record<string, string>, string]
      : [e.tag, e.attrs ?? {}, ...(e.children ? [e.children] : [])] as [string, Record<string, string>, string?],
  )
}

registerBuiltinAutoPages()

/**
 * 文章路由重写：文件名 posts/YYYY-MM-DD-<slug>.md → URL /posts/<slug>
 * 使用函数形式，dev 下新增/删除文章时 resolvePages 会重新求值，避免静态表导致 404。
 * 草稿也参与重写（是否可见由 srcExclude 控制）。
 */
function postRewrite(id: string): string {
  if (!id.startsWith('posts/') || !id.endsWith('.md') || id.includes('/_')) return id
  const file = join(process.cwd(), 'docs', id)
  if (!existsSync(file)) return id
  try {
    const { data } = parseFrontmatter(readFileSync(file, 'utf-8'))
    const slug = (data as { slug?: unknown }).slug
    if (typeof slug === 'string' && slug) return `posts/${slug}.md`
  } catch {
    /* 解析失败则保持原路径 */
  }
  return id
}

const allPosts = loadPosts({ includeDrafts: true })
const draftExcludes = process.env.XIAO_INCLUDE_DRAFTS === '1'
  ? []
  : allPosts.filter((p) => p.frontmatter.draft).map((p) => `posts/${p.fileBase}.md`)

const srcExcludes = [...draftExcludes]

const hasDevDocs = (() => {
  try {
    return readdirSync(join(process.cwd(), 'docs', 'dev')).some((f) => f.endsWith('.md'))
  } catch {
    return false
  }
})()

function listDevDocRoutes(): string[] {
  if (!hasDevDocs) return []
  try {
    return readdirSync(join(process.cwd(), 'docs', 'dev'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => (f.toLowerCase() === 'index.md' ? '/dev' : `/dev/${f.replace(/\.md$/, '')}`))
  } catch {
    return []
  }
}

export default defineConfig({
  lang: site.lang,
  title: site.title,
  description: site.description,
  cleanUrls: true,
  srcDir: 'docs',
  scrollOffset: 72,
  srcExclude: srcExcludes,
  base,
  markdown: {
    // 目录用：提取 h2–h4，并保留嵌套 children 树
    headers: { level: [2, 3, 4] },
    theme: { light: 'github-light', dark: 'github-dark' },
    defaultHighlightLang: 'bash',
  },
  rewrites: postRewrite,
  themeConfig: { hasDevDocs } as never,
  head: [
    ['link', { rel: 'icon', href: `${site.url}/favicon.svg` }],
  ],
  transformPageData(pageData, ctx) {
    const fm = pageData.frontmatter as Record<string, unknown>
    const title = typeof fm.title === 'string' ? fm.title : site.title
    const description = typeof fm.description === 'string' ? fm.description : site.description
    const isPost = typeof fm.slug === 'string' && !!fm.slug
    const route = isPost ? postUrl(fm.slug as string) : pageData.relativePath.replace(/\.md$/, '')
    const entries: HeadEntry[] = [
      ...baseHead(title, description),
      ...canonicalHead(route),
    ]

    if (isPost) {
      const post = {
        frontmatter: fm as never,
        content: '',
        route,
        url: postUrl(fm.slug as string),
      }
      entries.push(...openGraphHead(post), ...twitterCardHead(post), ...blogPostingJsonLd(post))
      if (fm.noindex) entries.push(...noindexHead())
    }

    const headEntries = toHeadEntries(entries)
    pageData.frontmatter.head = [
      ...((pageData.frontmatter.head as unknown[]) ?? []),
      ...headEntries,
    ]
    return pageData
  },
  async buildEnd(siteConfig) {
    const outDir = siteConfig.outDir
    const posts = loadPosts()
    const issues = [...validatePosts(posts)]

    const devRoutes = listDevDocRoutes()
    const routes = ['/', ...autoPageRoutes(), ...devRoutes, ...posts.filter((p) => !p.frontmatter.draft && !p.frontmatter.noindex).map((p) => p.route)]
    issues.push(...validateBuild(outDir, routes, posts))
    buildAutoPagesData()

    const errors = issues.filter((i) => i.level === 'error')
    if (errors.length > 0) {
      throw new Error(`「晓」校验失败：\n${errors.map((e) => `  - ${e.message}`).join('\n')}`)
    }

    writeSitemap(outDir, posts, [...autoPageRoutes(), ...devRoutes])
    writeFeeds(outDir, posts)
    writeRobots(outDir)
  },
  vite: {
    publicDir: resolve(process.cwd(), 'public'),
    server: {
      host: true,
      strictPort: false,
    },
    plugins: [
      {
        name: 'xiao-assets',
        buildStart() {
          collectAssets()
          syncTimestamps()
          syncRedirectFiles()
        },
      },
      {
        name: 'xiao-redirects-dev',
        configureServer(server) {
          const redirects = loadRedirects()
          server.middlewares.use((req, res, next) => {
            const raw = (req.url ?? '').split('?')[0]
            // 去掉部署 base 前缀后再匹配 redirects.yml 中的站内路径
            const pathname =
              base !== '/' && raw.startsWith(base)
                ? raw.slice(base.length - 1)
                : raw
            const rule = findRedirect(redirects, pathname)
            if (rule) {
              res.statusCode = rule.status
              const prefix = base === '/' ? '' : base.replace(/\/$/, '')
              res.setHeader('Location', `${prefix}${rule.to}`)
              res.setHeader('Cache-Control', 'no-store')
              res.end()
              return
            }
            next()
          })
        },
      },
      {
        // 新建/删除文章后：VitePress 会刷新 pages，再推一次 full-reload，
        // 让客户端路由表与 posts.data 列表同步，避免进新文 404、首页不出现。
        name: 'xiao-posts-reload',
        configureServer(server) {
          const postsRoot = resolve(process.cwd(), 'docs', 'posts').replace(/\\/g, '/')
          const isPostMd = (file: string) => {
            const f = file.replace(/\\/g, '/')
            return f.startsWith(postsRoot) && f.endsWith('.md') && !f.includes('/_assets/')
          }
          let timer: ReturnType<typeof setTimeout> | undefined
          const scheduleReload = (file: string) => {
            if (!isPostMd(file)) return
            clearTimeout(timer)
            timer = setTimeout(() => {
              server.ws.send({ type: 'full-reload' })
            }, 80)
          }
          server.watcher.on('add', scheduleReload)
          server.watcher.on('unlink', scheduleReload)
        },
      },
    ],
  },
})
