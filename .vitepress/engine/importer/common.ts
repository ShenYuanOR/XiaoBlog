import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pinyin } from 'pinyin-pro'
import { parseFrontmatter } from '../posts.ts'
import type { MigratedImage, MigratedPost, MigrationSource } from './types.ts'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}

/** 中文段转拼音，ASCII 段原样保留（如 2024-02-01-中文测试 → 2024-02-01-zhong-wen-ce-shi） */
export function toPinyinSlug(text: string): string {
  return text
    .split(/([\u4e00-\u9fa5]+)/)
    .map((seg) => {
      if (/^[\u4e00-\u9fa5]+$/.test(seg)) {
        return pinyin(seg, { toneType: 'none', type: 'array' })
          .map((s) => s.replace(/[^a-zA-Z0-9]/g, ''))
          .filter(Boolean)
          .join('-')
      }
      return seg.replace(/[^a-zA-Z0-9]+/g, '-')
    })
    .filter(Boolean)
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

/** 从标题生成候选 slug（中文转拼音） */
export function slugFromTitle(title: string): string {
  const normalized = title
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!normalized) return `post-${Date.now().toString(36)}`
  if (SLUG_RE.test(normalized)) return normalized
  const py = toPinyinSlug(normalized)
  return py || `post-${Date.now().toString(36)}`
}

/** 启发式推断无语言代码块的语言（供迁移/标注时补标记，获得准确高亮） */
export function inferCodeLang(code: string): string | null {
  const s = code.trim()
  if (!s) return null
  if (/^[{[]/.test(s) && /"[^"]+"\s*:/.test(s) && /[}\]]\s*$/.test(s)) return 'json'
  if (/<\/?[a-z][^>]*>/i.test(s) && /<\/[a-z]+>/i.test(s)) return 'html'
  if (s.includes('{') && s.includes('}') && /^[.#\w][\w\s,.#>]*\{/m.test(s) && /[a-z-]+\s*:\s*[^;{}]+;/i.test(s)) return 'css'
  if (/^(npm|pnpm|yarn|npx|git|cd |sudo|apt|pip|node |docker|bash|sh |curl|wget|chmod|mkdir|cp |mv |rm |echo |set |export |cls|dir |md |powershell|taskkill)/im.test(s)) return 'bash'
  if (/\b(var|let|const|function|return|typeof|new)\b/.test(s) && /[;{}]/.test(s) && /[\w.]+\s*\(/.test(s)) return 'javascript'
  if (/\b(public|private|class|void|int|string|using|namespace)\b/.test(s) && /[;{}]/.test(s)) return 'csharp'
  if (/^[<>]?(?:div|span|a|button|input|h[1-6]|p|img|table|ul|ol|li|form|script|style)(?:\s|>)/i.test(s)) return 'html'
  return null
}

/** 为正文中无语言标记的代码块补齐推断语言（` ``` ` → ` ```json ` 等） */
export function annotateCodeBlocks(content: string): { content: string; annotated: number } {
  let annotated = 0
  let out = content.replace(/```(\s*)\n([\s\S]*?)(```)/g, (_m, _space, body, closing) => {
    const lang = inferCodeLang(body)
    if (!lang) return _m
    annotated += 1
    return `\`\`\`${lang}\n${body}${closing}`
  })

  // 缩进代码块（markdown 4 空格缩进，无法标注语言）→ 转为 fence 并推断语言，获得高亮
  // 注意：跳过已有 fence 区域内部（避免嵌套处理）
  const lines = out.split(/\r?\n/)
  const result: string[] = []
  let i = 0
  let inFence = false
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {
      inFence = !inFence
      result.push(line)
      i++
      continue
    }
    if (inFence) {
      result.push(line)
      i++
      continue
    }
    const m = line.match(/^( {4}|\t)(.*)$/)
    if (m && !line.trim().startsWith('```')) {
      const startIdx = i
      const block: string[] = []
      while (i < lines.length) {
        const lm = lines[i].match(/^( {4}|\t)(.*)$/)
        if (lm) {
          block.push(lm[2])
          i++
        } else if (lines[i].trim() === '') {
          block.push('')
          i++
        } else {
          break
        }
      }
      while (block.length && block[block.length - 1] === '') block.pop()
      const code = block.join('\n')
      const lang = inferCodeLang(code)
      if (lang) {
        annotated += 1
        result.push(`\`\`\`${lang}`, ...block, '```')
      } else {
        result.push(...lines.slice(startIdx, i))
      }
      continue
    }
    result.push(line)
    i++
  }
  return { content: result.join('\n'), annotated }
}

/** 从文件名派生 slug：去日期前缀后保留（valaxy 风格），中文转拼音 */
export function slugFromFile(fileBase: string): string {
  const withoutDate = fileBase.replace(/^\d{4}-\d{2}-\d{2}-/, '')
  if (SLUG_RE.test(withoutDate)) return withoutDate
  const py = toPinyinSlug(withoutDate)
  return py || withoutDate
}

export function toWallClock(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = value
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/)
    if (m) return m[2] ? `${m[1]} ${m[2]}` : `${m[1]} 00:00:00`
  }
  return ''
}

function imageRefsFromContent(content: string): string[] {
  const out: string[] = []
  const re = /!\[[^\]]*\]\(([^)]+)\)/g
  for (const m of content.matchAll(re)) {
    const href = m[1].trim()
    if (/^(https?:)?\/\//.test(href)) continue
    out.push(href.split('#')[0].split('?')[0])
  }
  return out
}

/** 解析图片引用：相对文章目录或站内绝对路径（如 /posts/<dir>/x.png） */
export function resolveImages(
  refs: string[],
  mdPath: string,
  publicDir: string | undefined,
): MigratedImage[] {
  const images: MigratedImage[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    if (seen.has(ref)) continue
    seen.add(ref)
    let src = ''
    let destName = ''
    if (ref.startsWith('/')) {
      // 站内绝对路径：/posts/<dir>/x.png → public/posts/<dir>/x.png
      const rel = ref.replace(/^\//, '')
      if (publicDir) src = join(publicDir, rel)
      destName = rel.split('/').pop() ?? ref
    } else {
      // 相对路径：./x.png → 与 md 同目录
      src = join(require('node:path').dirname(mdPath), ref)
      destName = ref.split('/').pop() ?? ref
    }
    images.push({
      ref,
      src,
      exists: existsSync(src),
      destName: destName.replace(/[^\w.-]/g, '_'),
    })
  }
  return images
}

export { parseFrontmatter, readdirSync, readFileSync, existsSync, join, DATE_RE }
