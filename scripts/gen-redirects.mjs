#!/usr/bin/env node
/**
 * 晓 · 重定向生成：pnpm gen:redirects
 * 读取 redirects/redirects.yml（URL 迁移唯一事实来源），生成：
 *   - public/_redirects（GitHub Pages / Netlify 通用格式，随构建进入 dist）
 *   - redirects/redirects.nginx.conf（Nginx 规则片段）
 * 校验：目标必须存在（文章 slug 或内置页面），禁止自环。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import { loadPosts } from '../.vitepress/engine/posts.ts'
import { normalizeRoute } from '../.vitepress/engine/url.ts'

const ymlPath = join(process.cwd(), 'redirects', 'redirects.yml')
if (!existsSync(ymlPath)) {
  console.error(`缺少 ${ymlPath}`)
  process.exit(1)
}

const doc = parseYaml(readFileSync(ymlPath, 'utf-8'))
const entries = (doc?.redirects ?? []) || []

const posts = loadPosts()
const known = new Set([
  '/',
  '/archives',
  '/tags',
  '/categories',
  '/about',
  '/404',
  ...posts.map((p) => normalizeRoute(p.route)),
])

const issues = []
const seen = new Set()
for (const r of entries) {
  const from = normalizeRoute(r.from)
  const to = normalizeRoute(r.to)
  if (seen.has(from)) issues.push(`重复源: ${r.from}`)
  seen.add(from)
  if (from === to) issues.push(`自环: ${r.from}`)
  if (!known.has(to)) issues.push(`目标不存在: ${r.from} → ${r.to}`)
  if (![301, 302, 410].includes(r.status ?? 301)) issues.push(`status 非法（301/302/410）: ${r.from}`)
}

if (issues.length) {
  console.error(`redirects 校验失败:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
  process.exit(1)
}

const netlify = entries
  .map((r) => `${r.from}  ${r.to}  ${r.status ?? 301}`)
  .join('\n')
const nginx = entries
  .map((r) => `location = ${r.from} { return ${r.status ?? 301} ${r.to}; }`)
  .join('\n\n')

writeFileSync(join(process.cwd(), 'public', '_redirects'), netlify ? `${netlify}\n` : '')
writeFileSync(join(process.cwd(), 'redirects', 'redirects.nginx.conf'), nginx ? `${nginx}\n` : '')

console.log(`[gen-redirects] ${entries.length} 条规则 → public/_redirects + redirects/redirects.nginx.conf`)
