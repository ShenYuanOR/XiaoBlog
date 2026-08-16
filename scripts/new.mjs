#!/usr/bin/env node
/**
 * 晓 · 发文向导：npm run new / pnpm new
 * 纯 Node + readline，无全局依赖。生成 docs/posts/YYYY-MM-DD-<slug>.md 并预建图片目录。
 * TTY 交互模式；管道输入（脚本/CI）自动支持。
 */
import { createInterface } from 'node:readline'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pinyin } from 'pinyin-pro'

const isTTY = Boolean(process.stdin.isTTY)
const pipedLines = []
let pipedReady = false

if (!isTTY) {
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk) => pipedLines.push(...chunk.split(/\r?\n/)))
  process.stdin.on('end', () => {
    pipedReady = true
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const rl = isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null

async function ask(question) {
  process.stdout.write(question)
  if (isTTY) {
    return new Promise((resolve) => rl.question('', resolve))
  }
  while (!pipedReady && pipedLines.length === 0) {
    await delay(10)
  }
  return (pipedLines.shift() ?? '').trim()
}

/** 打印字段说明（仅 TTY，避免污染管道输出） */
function tip(...lines) {
  if (!isTTY) return
  for (const line of lines) console.log(`  · ${line}`)
}

function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function now() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function slugify(text) {
  const py = pinyin(text, { toneType: 'none', type: 'array' })
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .filter(Boolean)
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return py
}

const LAYOUTS = ['essay', 'note', 'page']

async function main() {
  if (isTTY) {
    console.log('晓 · 发文向导')
    console.log('按提示逐项填写；带「默认」的项可直接回车采用默认值。')
    console.log('完成后会生成 Markdown 与图片暂存目录，再用 pnpm dev 预览。\n')
  } else {
    console.log('晓 · 发文向导\n')
  }

  tip('将写入 frontmatter.title，并作为正文一级标题')
  const title = (await ask('文章标题: ')).trim()
  if (!title) {
    console.error('标题不能为空')
    process.exit(1)
  }

  const defaultSlug = slugify(title)
  tip(
    '决定文章 URL：/posts/<slug>（发布后请勿再改；改动需登记 redirects.yml）',
    '仅小写字母、数字、连字符；由标题拼音自动生成，可手改',
  )
  let slug = (await ask(`slug（默认: ${defaultSlug}）: `)).trim()
  if (!slug) slug = defaultSlug
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    console.error('slug 仅支持小写字母、数字、连字符（例: hello-xiao）')
    process.exit(1)
  }

  const defaultDate = now()
  tip('格式 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss；用于排序与展示')
  const date = (await ask(`date（默认: ${defaultDate}）: `)).trim() || defaultDate

  tip('用于 meta / OG / sitemap / RSS，建议 1～2 句说清文章在讲什么')
  const description = (await ask('description（摘要，必填）: ')).trim()
  if (!description) {
    console.error('description 是必填字段（SEO 使用）')
    process.exit(1)
  }

  tip('多个标签用英文或中文逗号分隔，例: 随笔,技术；可留空')
  const tags = (await ask('tags（逗号分隔，可空）: ')).trim()
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)

  tip('单值分类，出现在分类页；可留空')
  const category = (await ask('category（可选）: ')).trim()

  tip('public 内路径，例: /covers/hello.png；可留空')
  const cover = (await ask('cover（可选）: ')).trim()

  tip(
    'essay = 长文（默认）· note = 短记 · page = 独立页样式',
    `可选: ${LAYOUTS.join(' / ')}`,
  )
  const layoutAns = (await ask(`layout（默认 essay）: `)).trim().toLowerCase() || 'essay'
  if (layoutAns && !LAYOUTS.includes(layoutAns)) {
    console.error(`layout 无效，可选: ${LAYOUTS.join(' / ')}（将使用 essay）`)
  }
  const layout = LAYOUTS.includes(layoutAns) ? layoutAns : 'essay'

  tip('y = 草稿（dev 默认隐藏、不构建、不进 sitemap/RSS）；直接回车 = 正式文')
  const draftAns = (await ask('draft?（y/N）: ')).trim().toLowerCase()
  const draft = draftAns === 'y' || draftAns === 'yes'

  const lines = [
    '---',
    `title: ${title}`,
    `slug: ${slug}`,
    `date: ${date}`,
    `description: ${description}`,
    tags.length ? `tags:\n${tags.map((t) => `  - ${t}`).join('\n')}` : 'tags: []',
    category ? `category: ${category}` : null,
    cover ? `cover: ${cover}` : null,
    `layout: ${layout}`,
    draft ? 'draft: true' : null,
    '---',
    '',
    `# ${title}`,
    '',
  ].filter((l) => l !== null)

  const dir = join(process.cwd(), 'docs', 'posts')
  const file = join(dir, `${date.slice(0, 10)}-${slug}.md`)
  if (existsSync(file)) {
    console.error(`文件已存在: ${file}`)
    process.exit(1)
  }

  writeFileSync(file, lines.join('\n'), 'utf-8')
  const assetsDir = join(process.cwd(), 'docs', 'posts', '_assets', slug)
  mkdirSync(assetsDir, { recursive: true })
  // 兼容旧说明中的 public/posts 路径（构建归位目标在 public/images）
  mkdirSync(join(process.cwd(), 'public', 'posts', slug), { recursive: true })

  console.log('\n── 创建完成 ──')
  console.log(`文章: ${file}`)
  console.log(`图片暂存: docs/posts/_assets/${slug}/`)
  if (isTTY) {
    console.log('\n接下来:')
    console.log('  1. 编辑正文（frontmatter 已写好，可直接写内容）')
    console.log(`  2. 图片放到 docs/posts/_assets/${slug}/，正文写相对路径，例:`)
    console.log(`       ![](./_assets/${slug}/photo.png)`)
    console.log('     构建时会自动归位到 public/images/ 并改写 URL')
    console.log(draft
      ? '  3. pnpm dev:drafts 预览草稿 → 定稿后去掉 draft → pnpm build'
      : '  3. pnpm dev 预览 → pnpm build 校验通过后提交')
  } else {
    console.log(`图片目录: public/posts/${slug}/`)
    console.log('图片粘贴到 docs/posts/_assets/<slug>/ 并在正文写相对路径即可，构建时自动归位。')
  }
  rl?.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
