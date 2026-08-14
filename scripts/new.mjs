#!/usr/bin/env node
/**
 * 晓 · 发文向导：npm run new
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
  console.log('晓 · 发文向导\n')

  const title = (await ask('文章标题: ')).trim()
  if (!title) {
    console.error('标题不能为空')
    process.exit(1)
  }

  let slug = await ask(`slug（默认: ${slugify(title)}）: `)
  if (!slug) slug = slugify(title)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    console.error('slug 仅支持小写字母、数字、连字符')
    process.exit(1)
  }

  const date = (await ask(`date（默认: ${now()}）: `)).trim() || now()

  const description = (await ask('description（摘要，必填）: ')).trim()
  if (!description) {
    console.error('description 是必填字段（SEO 使用）')
    process.exit(1)
  }

  const tags = (await ask('tags（逗号分隔）: ')).trim()
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)

  const category = (await ask('category（可选）: ')).trim()
  const cover = (await ask('cover（可选，public 内路径）: ')).trim()
  const layoutAns = (await ask(`layout（默认 essay，可选 ${LAYOUTS.join('/')}）: `)).trim().toLowerCase() || 'essay'
  const layout = LAYOUTS.includes(layoutAns) ? layoutAns : 'essay'
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
  mkdirSync(join(process.cwd(), 'public', 'posts', slug), { recursive: true })
  console.log(`\n已创建: ${file}`)
  console.log(`图片目录: public/posts/${slug}/`)
  console.log('图片粘贴到 docs/posts/_assets/<slug>/ 并在正文写相对路径即可，构建时自动归位。')
  rl?.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
