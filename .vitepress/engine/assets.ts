import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseFrontmatter } from './posts.ts'
import { postDir } from './posts.ts'

const ASSET_RE = /!\[([^\]]*)\]\(\.\/_assets\/([^)]+)\)/g

export function assetStagingDir(slug: string): string {
  return join(postDir(), '_assets', slug)
}

/**
 * 图片归位目标：public/images/<slug>/。
 * 与文章路由 /posts/<slug> 完全分离，避免 clean URL 下
 * posts/<slug>.html 与 posts/<slug>/ 目录同名冲突。
 */
export function postAssetDir(slug: string): string {
  return join(process.cwd(), 'public', 'images', slug)
}

export interface CollectResult {
  moved: { slug: string; ref: string }[]
  missing: { slug: string; ref: string }[]
  rewritten: string[]
}

export function collectAssets(): CollectResult {
  const result: CollectResult = { moved: [], missing: [], rewritten: [] }
  const files: string[] = []
  try {
    files.push(...readdirSync(postDir()).filter((f) => f.endsWith('.md')))
  } catch {
    return result
  }

  for (const file of files) {
    const filePath = join(postDir(), file)
    const raw = readFileSync(filePath, 'utf-8')
    const { data } = parseFrontmatter(raw)
    const slug = data.slug
    if (typeof slug !== 'string' || !slug) continue

    const refs: string[] = []
    for (const m of raw.matchAll(ASSET_RE)) refs.push(m[2])
    if (refs.length === 0) continue

    const staging = join(postDir(), '_assets')
    const target = join(process.cwd(), 'public', 'images')
    let rewrote = false
    let newRaw = raw

    for (const ref of refs) {
      const src = join(staging, ref)
      const dest = join(target, ref)
      if (!existsSync(src)) {
        result.missing.push({ slug, ref })
        continue
      }
      if (!existsSync(dest)) {
        mkdirSync(join(target, dirname(ref)), { recursive: true })
        copyFileSync(src, dest)
        result.moved.push({ slug, ref })
      }
      const absRef = `/images/${ref}`
      newRaw = newRaw.replaceAll(`./_assets/${ref}`, absRef)
      rewrote = true
    }

    if (rewrote && newRaw !== raw) {
      writeFileSync(filePath, newRaw)
      result.rewritten.push(file)
    }
  }
  return result
}

export function hasStagedAssets(): boolean {
  return existsSync(join(postDir(), '_assets'))
}
