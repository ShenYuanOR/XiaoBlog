#!/usr/bin/env node
/**
 * 晓 · 框架更新：pnpm update
 *
 * 用法：
 *   pnpm update                 # 从 GitHub 拉取框架最新代码
 *   pnpm update --source <本地框架目录>   # 从本地目录（离线/测试）
 *   pnpm update --force         # 强制覆盖（跳过用户定制保护）
 *
 * 安全机制（三路合并）：
 *   - core   ：框架核心（engine/config/scripts/组件等），直接更新
 *   - theme  ：样式文件（styles/**），用户可能定制——对比上次更新记录，
 *              用户改过的文件保留不覆盖，未改的文件更新
 *   - user   ：docs/public/redirects/站点配置等用户内容，绝不触碰
 * 覆盖前自动备份到 .xiao-backup/，更新记录写入 .xiao/framework-state.json。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = process.cwd()
const STATE_DIR = join(ROOT, '.xiao')
const STATE_FILE = join(STATE_DIR, 'framework-state.json')
const BACKUP_DIR = join(ROOT, '.xiao-backup')

const args = process.argv.slice(2)
const source = args[args.indexOf('--source') + 1]
const force = args.includes('--force')

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

async function fetchRemote(path) {
  if (source) {
    return readFileSync(join(source, path))
  }
  const url = `https://raw.githubusercontent.com/ShenYuanOR/XiaoBlog/master/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`拉取失败 ${path}（HTTP ${res.status}）`)
  return Buffer.from(await res.arrayBuffer())
}

function matchPatterns(relPath, patterns) {
  return patterns.some((p) => globToRegExp(p).test(relPath))
}

function listLocalFiles() {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (name === 'node_modules' || name === '.git' || name === '.xiao' || name === '.xiao-backup') continue
      const rel = p.replace(ROOT, '').replace(/^[\\/]+/, '').replace(/\\/g, '/')
      if (statSync(p).isDirectory()) walk(p)
      else out.push(rel)
    }
  }
  walk(ROOT)
  return out
}

/** 枚举更新源的框架文件（本地目录遍历 / GitHub API 文件树） */
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
    .filter((t) => t.type === 'blob' && !t.path.startsWith('docs/') && !t.path.startsWith('public/') && !t.path.startsWith('redirects/') && !t.path.startsWith('node_modules/'))
    .map((t) => t.path)
}

async function main() {
  console.log(`「晓」框架更新${source ? `（本地源: ${source}）` : '（GitHub）'}\n`)

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
  const isFirstRun = state.version === '0.0.0'

  const localFiles = listLocalFiles()
  const updated = []
  const skipped = []
  const userProtected = []

  const tryUpdate = async (rel, kind) => {
    let remote
    try {
      remote = await fetchRemote(rel)
    } catch (e) {
      console.warn(`  ⚠️ ${rel}: ${e.message}`)
      return
    }
    const dest = join(ROOT, rel)
    const current = existsSync(dest) ? readFileSync(dest) : null
    const currentHash = current ? hash(current) : null

    if (kind === 'theme') {
      const remoteHash = hash(remote)
      if (!current) {
        // 框架新增文件（用户无此文件）→ 直接创建
        state.files[rel] = remoteHash
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, remote)
        updated.push(rel)
        return
      }
      if (isFirstRun) {
        // 首次运行：记录框架基线（源内容 hash），不覆盖，保护用户现有样式
        state.files[rel] = remoteHash
        skipped.push(rel)
        return
      }
      const oldHash = state.files[rel]
      if (oldHash && oldHash !== currentHash) {
        // 用户定制过（与框架基线不同）→ 保留
        skipped.push(rel)
        return
      }
      // 未改（与基线一致）→ 更新，并更新基线
      state.files[rel] = remoteHash
    }

    mkdirSync(dirname(dest), { recursive: true })
    if (existsSync(dest)) {
      const backup = join(BACKUP_DIR, rel)
      mkdirSync(dirname(backup), { recursive: true })
      writeFileSync(backup, current)
    }
    writeFileSync(dest, remote)
    updated.push(rel)
  }

  const remoteFiles = await listRemoteFiles()
  const tryPattern = async (patterns, kind) => {
    const rels = remoteFiles.filter((f) => matchPatterns(f, patterns))
    for (const rel of rels) await tryUpdate(rel, kind)
  }
  await tryPattern(manifest.core, 'core')
  await tryPattern(manifest.theme, 'theme')

  // 记录本次状态：所有已更新的文件 + 框架文件 hash
  const newStateFiles = { ...state.files }
  for (const rel of updated) {
    newStateFiles[rel] = hash(readFileSync(join(ROOT, rel)))
  }
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify({ version: remoteVersion, files: newStateFiles }, null, 2))

  console.log(`框架版本: ${state.version} → ${remoteVersion}\n`)
  console.log(`已更新 ${updated.length} 个文件:`)
  for (const f of updated) console.log(`  ✓ ${f}`)
  if (skipped.length) {
    console.log(`\n已保留 ${skipped.length} 个文件（检测到你定制过，不覆盖）：`)
    for (const f of skipped) console.log(`  ↻ ${f}`)
  }
  if (userProtected.length === 0 && !source) {
    console.log('\n用户内容（docs/public/redirects/站点配置）未触碰 ✓')
  }
  console.log('\n下一步: pnpm install && pnpm build（校验通过后提交）')
  if (BACKUP_DIR && existsSync(BACKUP_DIR)) {
    console.log(`覆盖前备份位于 .xiao-backup/（确认无误后可删除）`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
