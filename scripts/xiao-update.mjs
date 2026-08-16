#!/usr/bin/env node
/**
 * 晓 · 框架更新：pnpm xiao:update
 *
 * 用法：
 *   pnpm xiao:update                         # 从 GitHub 拉取 core
 *   pnpm xiao:update --source <本地框架目录>   # 从本地目录（离线/测试）
 *
 * 更新范围：
 *   - core ：框架核心（engine/config/scripts 等），直接覆盖（覆盖前备份）
 *   - theme：默认参考主题（styles/Layout/views/components），不自动更新；
 *            需要时对照上游自行比对合并
 *   - user ：文章/静态资源/站点配置等，绝不触碰
 * 更新记录写入 .xiao/framework-state.json；覆盖前备份到 .xiao-backup/。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()
const STATE_DIR = join(ROOT, '.xiao')
const STATE_FILE = join(STATE_DIR, 'framework-state.json')
const BACKUP_DIR = join(ROOT, '.xiao-backup')

const args = process.argv.slice(2)
const sourceIdx = args.indexOf('--source')
const source = sourceIdx >= 0 ? args[sourceIdx + 1] : undefined

function hash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

function globToRegExp(pattern) {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DS__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DS__/g, '.*')
  return new RegExp(`^${re}$`)
}

function matchPatterns(relPath, patterns) {
  return patterns.some((p) => globToRegExp(p).test(relPath))
}

async function fetchRemote(path) {
  if (source) {
    return readFileSync(join(source, path))
  }
  const url = `https://raw.githubusercontent.com/ShenYuanOR/XiaoBlog/master/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`拉取失败 ${path}（HTTP ${res.status}）`)
  return Buffer.from(await res.arrayBuffer())
}

/** 枚举更新源文件（本地目录 / GitHub 文件树） */
async function listRemoteFiles() {
  if (source) {
    const out = []
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (name === 'node_modules' || name === '.git' || name === '.xiao' || name === '.xiao-backup') continue
        const rel = p.replace(source, '').replace(/^[\\/]+/, '').replace(/\\/g, '/')
        if (statSync(p).isDirectory()) walk(p)
        else out.push(rel)
      }
    }
    walk(source)
    return out
  }
  const res = await fetch('https://api.github.com/repos/ShenYuanOR/XiaoBlog/git/trees/master?recursive=1')
  if (!res.ok) throw new Error(`无法获取文件树（HTTP ${res.status}）`)
  const tree = await res.json()
  return (tree.tree ?? [])
    .filter((t) => (
      t.type === 'blob'
      && !t.path.startsWith('docs/')
      && !t.path.startsWith('public/')
      && !t.path.startsWith('redirects/')
      && !t.path.startsWith('node_modules/')
    ))
    .map((t) => t.path)
}

async function main() {
  console.log(`「晓」框架更新${source ? `（本地源: ${source}）` : '（GitHub）'} · 仅 core\n`)

  let manifest
  try {
    const buf = await fetchRemote('framework-manifest.json')
    manifest = JSON.parse(buf.toString('utf-8'))
  } catch (e) {
    console.error(`无法获取框架清单: ${e.message}`)
    console.error('请确认网络可用，或用 --source <本地框架目录> 指定更新源')
    process.exit(1)
  }

  const remoteVersion = manifest.version
  let state = { version: '0.0.0', files: {} }
  if (existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    } catch {
      state = { version: '0.0.0', files: {} }
    }
  }

  const corePatterns = manifest.core ?? []
  if (!corePatterns.length) {
    console.error('清单缺少 core 字段')
    process.exit(1)
  }

  const updated = []
  const remoteFiles = await listRemoteFiles()
  const coreFiles = remoteFiles.filter((f) => matchPatterns(f, corePatterns))

  for (const rel of coreFiles) {
    let remote
    try {
      remote = await fetchRemote(rel)
    } catch (e) {
      console.warn(`  ⚠️ ${rel}: ${e.message}`)
      continue
    }
    const dest = join(ROOT, rel)
    const current = existsSync(dest) ? readFileSync(dest) : null
    if (current && hash(current) === hash(remote)) continue

    mkdirSync(dirname(dest), { recursive: true })
    if (current) {
      const backup = join(BACKUP_DIR, rel)
      mkdirSync(dirname(backup), { recursive: true })
      writeFileSync(backup, current)
    }
    writeFileSync(dest, remote)
    updated.push(rel)
  }

  const newStateFiles = { ...state.files }
  for (const rel of updated) {
    newStateFiles[rel] = hash(readFileSync(join(ROOT, rel)))
  }
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify({ version: remoteVersion, files: newStateFiles }, null, 2))

  console.log(`框架版本: ${state.version} → ${remoteVersion}\n`)
  console.log(`已更新 ${updated.length} 个 core 文件:`)
  for (const f of updated) console.log(`  ✓ ${f}`)

  const themeN = (manifest.theme ?? []).length
  console.log(`\ntheme（清单 ${themeN} 条，默认参考主题）未自动更新；需要时对照上游自行比对合并`)
  console.log('user（docs/public/redirects/站点配置）未触碰 ✓')
  console.log('\n下一步: pnpm install && pnpm build（校验通过后提交）')
  if (existsSync(BACKUP_DIR)) {
    console.log('覆盖前备份位于 .xiao-backup/（确认无误后可删除）')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
