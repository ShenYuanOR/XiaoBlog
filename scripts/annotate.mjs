#!/usr/bin/env node
/**
 * 晓 · 代码语言标注：pnpm annotate
 * 为 docs/posts/ 下所有文章的无语言代码块自动推断语言标记（json/html/css/bash），
 * 获得准确语法高亮。幂等：已标注的块不会重复处理。
 * 仅修改代码块标记，不动其他内容。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { parseFrontmatter } from '../.vitepress/engine/posts.ts'
import { annotateCodeBlocks } from '../.vitepress/engine/importer/common.ts'

const dir = join(process.cwd(), 'docs', 'posts')
let files = []
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.md'))
} catch {
  console.error('docs/posts 不存在')
  process.exit(1)
}

let annotatedBlocks = 0
let annotatedFiles = 0

for (const file of files) {
  const p = join(dir, file)
  const raw = readFileSync(p, 'utf-8')
  const { data, content } = parseFrontmatter(raw)
  const r = annotateCodeBlocks(content)
  if (r.annotated === 0) continue
  writeFileSync(p, matter.stringify(r.content, data))
  annotatedBlocks += r.annotated
  annotatedFiles += 1
  console.log(`  ✓ ${file}（${r.annotated} 个代码块）`)
}

if (annotatedFiles === 0) {
  console.log('没有需要标注的代码块（全部已有语言标记或无需推断）')
} else {
  console.log(`\n完成: ${annotatedFiles} 篇文章，${annotatedBlocks} 个代码块已标注语言`)
  console.log('下一步: pnpm build 验证高亮效果')
}
