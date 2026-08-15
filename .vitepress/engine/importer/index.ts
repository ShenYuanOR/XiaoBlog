import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scanValaxy } from './valaxy.ts'
import { scanHexo } from './hexo.ts'
import { isValidSlug, annotateCodeBlocks } from './common.ts'
import type { ApplyResult, MigrationReport, MigrationSource, MigratedPost } from './types.ts'

export function scan(source: MigrationSource): MigrationReport {
  const posts = source.name === 'valaxy' ? scanValaxy(source) : scanHexo(source)

  const slugSeen = new Map<string, string>()
  const slugConflicts: string[] = []
  for (const post of posts) {
    if (!isValidSlug(post.slug)) {
      slugConflicts.push(`${post.title}：slug「${post.slug}」不合法（仅小写 ASCII 连字符）`)
    }
    if (slugSeen.has(post.slug)) {
      slugConflicts.push(`slug 冲突：「${post.slug}」同时用于「${slugSeen.get(post.slug)}」与「${post.title}」`)
    }
    slugSeen.set(post.slug, post.title)
  }

  return {
    sourceName: source.name,
    posts,
    slugConflicts,
    summary: {
      total: posts.length,
      missingDescription: posts.filter((p) => !p.description).length,
      missingImages: posts.reduce((n, p) => n + p.images.filter((i) => !i.exists).length, 0),
      slugChanged: posts.filter((p) => p.oldUrl && !p.oldUrl.endsWith(`/posts/${p.slug}`)).length,
      redirects: 0,
    },
  }
}

/** 从正文提取 description 初稿（去 markdown 符号，取前 120 字符） */
export function extractDescription(content: string, max = 120): string {
  const text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, max)
}

function buildFrontmatter(post: MigratedPost): string {
  const tags = post.tags.length > 0 ? post.tags : ['未分类']
  const lines = [
    '---',
    `title: ${post.title.replace(/\n/g, ' ')}`,
    `slug: ${post.slug}`,
    `date: ${post.date}`,
    `description: ${(post.description ?? extractDescription(post.content)).replace(/\n/g, ' ')}`,
    `tags:\n${tags.map((t) => `  - ${t.replace(/\n/g, ' ')}`).join('\n')}`,
    post.category ? `category: ${post.category}` : null,
    'layout: essay',
    '---',
  ].filter((l) => l !== null)
  return lines.join('\n')
}

export interface ApplyOptions {
  /** 目标文章目录（默认 docs/posts） */
  postsDir?: string
  /** 目标暂存区根目录（默认 docs/posts/_assets） */
  assetsDir?: string
  /** redirects.yml 路径（默认 redirects/redirects.yml） */
  redirectsFile?: string
}

/**
 * 落盘（幂等）：
 * - 文章写入 docs/posts/YYYY-MM-DD-<slug>.md（目标已存在则跳过）
 * - 图片复制到 docs/posts/_assets/<slug>/，正文引用改写为 ./_assets/<slug>/<文件名>
 * - 存在旧 URL 且 slug 变化时，向 redirects.yml 追加 301
 */
export function apply(report: MigrationReport, options: ApplyOptions = {}): ApplyResult {
  const postsDir = options.postsDir ?? join(process.cwd(), 'docs', 'posts')
  const assetsRoot = options.assetsDir ?? join(postsDir, '_assets')
  mkdirSync(postsDir, { recursive: true })
  const result: ApplyResult = { written: [], skipped: [], imagesCopied: 0, redirectsAdded: 0 }

  for (const post of report.posts) {
    const datePrefix = post.date.slice(0, 10)
    const target = join(postsDir, `${datePrefix}-${post.slug}.md`)
    if (existsSync(target)) {
      result.skipped.push(`${post.slug}（目标已存在）`)
      continue
    }

    let content = post.content
    if (post.images.length > 0) {
      const stagingDir = join(assetsRoot, post.slug)
      for (const img of post.images) {
        if (!img.exists) continue
        mkdirSync(stagingDir, { recursive: true })
        copyFileSync(img.src, join(stagingDir, img.destName))
        result.imagesCopied += 1
        content = content.replaceAll(img.ref, `./_assets/${post.slug}/${img.destName}`)
      }
    }

    // 无语言代码块自动推断语言标记（获得准确高亮）
    const annotated = annotateCodeBlocks(content)
    if (annotated.annotated > 0) content = annotated.content

    const fm = buildFrontmatter(post)
    writeFileSync(target, `${fm}\n\n${content.trim()}\n`, 'utf-8')
    result.written.push(target)
  }

  const changed = report.posts.filter((p) => p.oldUrl && !p.oldUrl.endsWith(`/posts/${p.slug}`))
  if (changed.length > 0) {
    const redirectsFile = options.redirectsFile ?? join(process.cwd(), 'redirects', 'redirects.yml')
    let yml = ''
    if (existsSync(redirectsFile)) {
      yml = readFileSync(redirectsFile, 'utf-8')
    }
    const existingFroms = new Set(
      [...yml.matchAll(/^\s*-?\s*from:\s*(\S+)/gm)].map((m) => m[1]),
    )
    const toAdd = changed.filter((p) => !existingFroms.has(new URL(p.oldUrl!).pathname))
    if (toAdd.length > 0) {
      const rules = toAdd
        .map((p) => {
          const from = new URL(p.oldUrl!).pathname
          return `  - from: ${from}\n    to: /posts/${p.slug}\n    status: 301`
        })
        .join('\n')
      const header = [
        '# 「晓」URL 迁移唯一事实来源',
        '# from: 旧路径（不含域名）；to: 目标路径或完整 URL；status: 301 / 302 / 410',
        '# 运行 pnpm gen:redirects 生成 _redirects（GitHub Pages / Netlify）与 nginx 规则',
        '',
      ].join('\n')
      const marker = 'redirects: []'
      if (yml.includes(marker)) {
        yml = yml.replace(marker, `redirects:\n${rules}`)
      } else if (yml.trim()) {
        yml = `${yml.replace(/\s*$/, '')}\n${rules}\n`
      } else {
        yml = `${header}redirects:\n${rules}\n`
      }
      mkdirSync(join(redirectsFile, '..'), { recursive: true })
      writeFileSync(redirectsFile, yml, 'utf-8')
      result.redirectsAdded = toAdd.length
    }
  }
  return result
}
