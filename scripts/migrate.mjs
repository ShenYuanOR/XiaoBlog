#!/usr/bin/env node
/**
 * 晓 · 迁移工具：pnpm migrate
 *
 * 用法：
 *   pnpm migrate --from valaxy --source <旧站路径> [--site-url <旧站域名>] [--keep-date-slug] [--out <输出根目录>]
 *   pnpm migrate --from hexo  --source <旧站路径> [--apply] [--yes]
 *
 * 默认只读：扫描并输出迁移报告（不写任何文件）。
 * 加 --apply 落盘（文章 + 图片 + redirects.yml），落盘前会再次确认（--yes 跳过）。
 * --keep-date-slug：保留源文件名（含日期前缀）作 slug，旧 URL 不变、零重定向（默认：纯净 slug + 自动登记 301）。
 * --out：落盘输出根目录（默认项目根；演练时可用临时目录，验证后删除）。
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

function printUsage() {
  console.error(`晓 · 迁移工具

用法:
  pnpm migrate --from <valaxy|hexo> --source <旧站路径> [选项]

必填:
  --from <valaxy|hexo>   旧站框架
  --source <路径>        旧站项目根目录

可选:
  --site-url <域名>      旧站完整域名（用于还原绝对 URL 图片等）
  --keep-date-slug       保留源文件名（含日期）作 slug，旧 URL 不变
  --apply                扫描通过后写入文章 / 图片 / redirects.yml
  --yes                  与 --apply 联用，跳过落盘确认（CI/脚本）
  --out <目录>           落盘到指定根目录（默认当前项目；演练可用临时目录）

流程建议:
  1. 先不加 --apply，只看报告
  2. 确认无误后加 --apply 落盘（TTY 下会再问一次）
  3. pnpm dev 预览 → pnpm build 校验 → 提交

示例:
  pnpm migrate --from hexo --source ../my-hexo-blog
  pnpm migrate --from valaxy --source ../old-site --site-url https://example.com --apply
`)
}

async function main() {
  const from = (flag('--from') ?? '').toLowerCase()
  const sourceDir = flag('--source')
  const siteUrl = flag('--site-url')
  const doApply = has('--apply')
  const yes = has('--yes')
  const keepDateSlug = has('--keep-date-slug')
  const outDir = flag('--out')

  if (!['valaxy', 'hexo'].includes(from) || !sourceDir) {
    printUsage()
    if (!['valaxy', 'hexo'].includes(from)) {
      console.error('错误: 缺少或无效的 --from（应为 valaxy 或 hexo）')
    } else {
      console.error('错误: 缺少 --source <旧站路径>')
    }
    process.exit(1)
  }

  if (isTTY) {
    console.log('晓 · 迁移工具')
    console.log(`来源框架: ${from}`)
    console.log(`旧站路径: ${sourceDir}`)
    if (siteUrl) console.log(`旧站域名: ${siteUrl}`)
    if (keepDateSlug) console.log('slug 策略: 保留日期前缀（--keep-date-slug）')
    else console.log('slug 策略: 纯净 slug（变更将登记 301）')
    if (outDir) console.log(`输出目录: ${outDir}`)
    console.log(doApply
      ? '模式: 扫描 + 落盘（--apply）'
      : '模式: 仅扫描报告（不加 --apply 不会写入任何文件）')
    console.log('')
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
    console.log('\n── 仅报告，未写入任何文件 ──')
    if (isTTY) {
      console.log('确认报告无误后，在同一命令后加 --apply 落盘，例如:')
      console.log(`  pnpm migrate --from ${from} --source ${sourceDir}${siteUrl ? ` --site-url ${siteUrl}` : ''}${keepDateSlug ? ' --keep-date-slug' : ''}${outDir ? ` --out ${outDir}` : ''} --apply`)
      console.log('落盘前 TTY 下仍会二次确认；脚本/CI 可再加 --yes 跳过确认。')
    } else {
      console.log('（确认后加 --apply 落盘）')
    }
    return
  }

  if (isTTY && !yes) {
    console.log('\n即将落盘，会执行:')
    console.log(`  · 写入文章 → ${outDir ? `${outDir}/docs/posts` : 'docs/posts'}`)
    console.log(`  · 复制图片 → ${outDir ? `${outDir}/docs/posts/_assets` : 'docs/posts/_assets'}`)
    console.log(`  · 更新重定向 → ${outDir ? `${outDir}/redirects/redirects.yml` : 'redirects/redirects.yml'}`)
    if (!outDir) console.log('  · 同步生成 public/_redirects 与 nginx 片段')
    if (report.slugConflicts.length) {
      console.log('\n⚠️ 仍存在 slug 冲突，建议先处理后再落盘。')
    }
  }

  const confirm = yes ? 'y' : (await ask('\n确认落盘？输入 y 继续，其他键取消（y/N）: ')).toLowerCase()
  if (confirm !== 'y' && confirm !== 'yes') {
    console.log('已取消，未写入任何文件')
    return
  }

  const result = apply(report, outDir
    ? {
        postsDir: `${outDir}/docs/posts`,
        assetsDir: `${outDir}/docs/posts/_assets`,
        redirectsFile: `${outDir}/redirects/redirects.yml`,
      }
    : undefined)
  console.log(`\n完成: 写入 ${result.written.length} 篇，跳过 ${result.skipped.length}，复制图片 ${result.imagesCopied} 个，登记重定向 ${result.redirectsAdded} 条`)

  if (!outDir) {
    const { syncRedirectFiles } = await import('../.vitepress/engine/redirects.ts')
    const gen = syncRedirectFiles()
    if (gen.issues.length) {
      console.warn(`\n⚠️ redirects 校验警告:\n${gen.issues.map((i) => `  - ${i}`).join('\n')}`)
    } else {
      console.log(`已生成 _redirects（${gen.count} 条规则），部署后旧 URL 自动 301 跳转`)
    }
  }

  if (result.written.length) {
    console.log('\n下一步:')
    console.log('  1. pnpm dev 预览迁移结果（检查 slug、正文、图片）')
    console.log('  2. pnpm build 全量校验')
    console.log('  3. 抽查 redirects.yml 与旧站 URL 是否一致')
    console.log('  4. 确认无误后提交')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
