import { defineConfig } from 'vitepress'
import { resolve } from 'node:path'
import { site } from './site.config.ts'
import { collectAssets } from './engine/assets.ts'
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

export default defineConfig({
  lang: site.lang,
  title: site.title,
  description: site.description,
  cleanUrls: true,
  srcDir: 'docs',
  srcExclude: draftExcludes,
  rewrites: postRewrites,
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
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

    const routes = ['/', ...autoPageRoutes(), ...posts.filter((p) => !p.frontmatter.draft && !p.frontmatter.noindex).map((p) => p.route)]
    issues.push(...validateBuild(outDir, routes, posts))
    buildAutoPagesData()

    const errors = issues.filter((i) => i.level === 'error')
    if (errors.length > 0) {
      throw new Error(`「晓」校验失败：\n${errors.map((e) => `  - ${e.message}`).join('\n')}`)
    }

    writeSitemap(outDir, posts, autoPageRoutes())
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
        },
      },
    ],
  },
})
