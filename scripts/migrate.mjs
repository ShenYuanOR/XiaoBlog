#!/usr/bin/env node
/**
 * 晓 · 迁移工具：pnpm migrate
 *
 * 用法：
 *   pnpm migrate --from valaxy --source <旧站路径> [--site-url <旧站域名>] [--keep-date-slug]
 *   pnpm migrate --from hexo  --source <旧站路径> [--apply] [--yes]
 *
 * 默认只读：扫描并输出迁移报告（不写任何文件）。
 * 加 --apply 落盘（文章 + 图片 + redirects.yml），落盘前会再次确认（--yes 跳过）。
 * --keep-date-slug：保留源文件名（含日期前缀）作 slug，旧 URL 不变、零重定向（默认：纯净 slug + 自动登记 301）。
 */
import { createInterface } from 'node:readline'
import { scan, apply } from '../.vitepress/engine/importer/index.ts'

const args = process.argv.slice(2)
function flag(name) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name) => args.includes(name)

const isTTY = Boolean(process.stdin.isTTY)
const pipedLines = []
let pipedReady = false
if (!isTTY) {
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (c) => pipedLines.push(...c.split(/\r?\n/)))
  process.stdin.on('end', () => { pipedReady = true })
}
function delay(ms) { return new Promise((r) => setTimeout(r, ms)) }
async function ask(question) {
  process.stdout.write(question)
  if (isTTY) return new Promise((r) => createInterface({ input: process.stdin, output: process.stdout }).question('', (a) => r(a)))
  while (!pipedReady && pipedLines.length === 0) await delay(10)
  return (pipedLines.shift() ?? '').trim()
}

async function main() {
  const from = (flag('--from') ?? '').toLowerCase()
  const sourceDir = flag('--source')
  const siteUrl = flag('--site-url')
  const doApply = has('--apply')
  const yes = has('--yes')
  const keepDateSlug = has('--keep-date-slug')

  if (!['valaxy', 'hexo'].includes(from)) {
    console.error('用法: pnpm migrate --from <valaxy|hexo> --source <旧站路径> [--site-url <域名>] [--keep-date-slug] [--apply] [--yes]')
    process.exit(1)
  }
  if (!sourceDir) {
    console.error('缺少 --source <旧站路径>')
    process.exit(1)
  }

  const source = {
    name: from,
    postsDir: from === 'valaxy' ? `${sourceDir}/pages/posts` : `${sourceDir}/source/_posts`,
    publicDir: from === 'valaxy' ? `${sourceDir}/public` : undefined,
    siteUrl,
    keepDateSlug,
  }

  const report = scan(source)
  const { summary } = report

  console.log(`\n「晓」迁移报告 —— 来源: ${from}\n`)
  console.log(`共 ${summary.total} 篇文章`)
  console.log(`  - 缺 description（将自动生成初稿）: ${summary.missingDescription}`)
  console.log(`  - 图片引用缺失: ${summary.missingImages}`)
  console.log(`  - slug 与旧 URL 不一致（需 301）: ${summary.slugChanged}`)
  if (report.slugConflicts.length) {
    console.log('\n⚠️ 需要处理的问题:')
    for (const c of report.slugConflicts) console.log(`  - ${c}`)
  }
  console.log('')

  for (const post of report.posts) {
    const imgState = post.images.length
      ? `${post.images.filter((i) => i.exists).length}/${post.images.length} 图`
      : ''
    const desc = post.description ? '' : ' [description 自动生成]'
    console.log(`  ${post.date.slice(0, 10)}  ${post.slug.padEnd(48)} ${post.title}${desc} ${imgState}`)
  }

  if (!doApply) {
    console.log('\n（仅报告，未写入任何文件。确认后加 --apply 落盘）')
    return
  }

  const confirm = yes ? 'y' : (await ask('\n确认落盘？将写入文章、复制图片、更新 redirects.yml（y/N）: ')).toLowerCase()
  if (confirm !== 'y' && confirm !== 'yes') {
    console.log('已取消，未写入任何文件')
    return
  }

  const result = apply(report)
  console.log(`\n完成: 写入 ${result.written.length} 篇，跳过 ${result.skipped.length}，复制图片 ${result.imagesCopied} 个，登记重定向 ${result.redirectsAdded} 条`)
  if (result.written.length) console.log('\n下一步: pnpm dev 预览 → pnpm build 校验 → 检查 slug 与图片 → 提交')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
