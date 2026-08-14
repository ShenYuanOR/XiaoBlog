#!/usr/bin/env node
/**
 * 晓 · 图片整理：npm run tidy
 * 手动触发暂存区图片归位（构建时会自动执行，此命令用于手动整理与预览）。
 */
import { collectAssets } from '../.vitepress/engine/assets.ts'

const result = collectAssets()

if (result.moved.length) {
  console.log(`归位 ${result.moved.length} 个文件:`)
  for (const m of result.moved) console.log(`  - ${m.slug}/${m.ref}`)
}
if (result.missing.length) {
  console.error(`\n${result.missing.length} 个引用文件缺失:`)
  for (const m of result.missing) console.error(`  - ${m.slug}/${m.ref}`)
  process.exitCode = 1
}
if (result.rewritten.length) {
  console.log(`已改写引用: ${result.rewritten.length} 篇文章`)
}
if (!result.moved.length && !result.missing.length && !result.rewritten.length) {
  console.log('没有需要归位的图片')
}
