import { defineConfig } from 'vitepress'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { site } from './site.config.ts'
import { collectAssets } from './engine/assets.ts'
import { syncTimestamps } from './engine/timestamps.ts'
import { loadRedirects, findRedirect, syncRedirectFiles } from './engine/redirects.ts'
import { registerBuiltinAutoPages, buildAutoPagesData, autoPageRoutes } from './engine/automata.ts'
import { loadPosts } from './engine/posts.ts'
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
import { postUrl } from './engine/url.ts'
import type { HeadEntry } from './engine/seo/head.ts'

function toHeadEntries(entries: HeadEntry[]): unknown[] {
  return entries.map((e) =>
    e.tag === 'title'
      ? ['title', {}, e.children ?? ''] as [string, Record<string, string>, string]
      : [e.tag, e.attrs ?? {}, ...(e.children ? [e.children] : [])] as [string, Record<string, string>, string?],
  )
}

registerBuiltinAutoPages()

const allPosts = loadPosts({ includeDrafts: true })
const postRewrites = Object.fromEntries(
  allPosts
    .filter((p) => !p.frontmatter.draft)
    .map((p) => [`posts/${p.fileBase}.md`, `posts/${p.frontmatter.slug}.md`]),
)
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
  base: '/XiaoBlog/',
  markdown: {
    headers: true,
    theme: { light: 'github-light', dark: 'github-dark' },
    defaultHighlightLang: 'bash',
  },
  rewrites: postRewrites,
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
          const base = '/XiaoBlog/'
          server.middlewares.use((req, res, next) => {
            const raw = (req.url ?? '').split('?')[0]
            const pathname = raw.startsWith(base) ? raw.slice(base.length - 1) : raw
            const rule = findRedirect(redirects, pathname)
            if (rule) {
              res.statusCode = rule.status
              res.setHeader('Location', `${base.replace(/\/$/, '')}${rule.to}`)
              res.setHeader('Cache-Control', 'no-store')
              res.end()
              return
            }
            next()
          })
        },
      },
    ],
  },
})
