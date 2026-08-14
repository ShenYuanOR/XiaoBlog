import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import { blog } from '../blog.config.ts'
import { parseFrontmatter, postDir, toDateString } from './posts.ts'

export interface TimestampResult {
  filledDate: string[]
  updated: string[]
}

function stringifyData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    const value = data[key]
    out[key] = value instanceof Date && !Number.isNaN(value.getTime()) ? toDateString(value) : value
  }
  return out
}

/**
 * 自动补齐文章时间字段（幂等）：
 * - date 为空时用文件创建时间（birthtime，不可用时回退 mtime）写入，非空不动
 * - updated 开启且文件修改时间晚于已记录时间时写入当前时间
 * 写回后文件 mtime 与 updated 一致，下次构建不再触发。
 */
export function syncTimestamps(): TimestampResult {
  const result: TimestampResult = { filledDate: [], updated: [] }
  if (!blog.feature.autoDate && !blog.feature.autoUpdated) return result

  let files: string[] = []
  try {
    files = readdirSync(postDir()).filter((f) => f.endsWith('.md'))
  } catch {
    return result
  }

  for (const file of files) {
    const filePath = join(postDir(), file)
    const raw = readFileSync(filePath, 'utf-8')
    const { data, content } = parseFrontmatter(raw)
    if (typeof data.slug !== 'string' || !data.slug) continue

    const stat = statSync(filePath)
    let changed = false
    let filledDate = false

    if (blog.feature.autoDate && !data.date) {
      let birth = stat.birthtime
      if (Number.isNaN(birth.getTime()) || birth.getTime() <= 0) birth = stat.mtime
      data.date = toDateString(birth)
      changed = true
      filledDate = true
    }

    if (blog.feature.autoUpdated && data.date) {
      const recorded = data.updated ? toDateString(data.updated) : toDateString(data.date)
      const recordedTime = new Date(recorded.replace(' ', 'T')).getTime()
      if (!Number.isNaN(recordedTime) && stat.mtime.getTime() > recordedTime + 1000) {
        data.updated = toDateString(new Date())
        changed = true
      }
    }

    if (changed) {
      const newRaw = matter.stringify(content, stringifyData(data))
      writeFileSync(filePath, newRaw)
      if (filledDate) result.filledDate.push(file)
      else result.updated.push(file)
    }
  }
  return result
}
