import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { CORE_SCHEMA, load as parseYaml } from 'js-yaml'
import { loadPosts } from './posts.ts'
import { normalizeRoute } from './url.ts'

export interface RedirectRule {
  from: string
  to: string
  status: number
}

/** 读取 redirects.yml（URL 迁移唯一事实来源） */
export function loadRedirects(ymlPath?: string): RedirectRule[] {
  const file = ymlPath ?? join(process.cwd(), 'redirects', 'redirects.yml')
  if (!existsSync(file)) return []
  const doc = parseYaml(readFileSync(file, 'utf-8')) as { redirects?: RedirectRule[] } | null
  return (doc?.redirects ?? []).map((r) => ({
    from: normalizeRoute(r.from),
    to: normalizeRoute(r.to),
    status: r.status ?? 301,
  }))
}

/**
 * 校验重定向规则：源不重复、无自环、目标存在（文章/自动页/首页/独立页）、status 合法。
 * 返回错误列表（空 = 通过）。
 */
export function validateRedirects(redirects: RedirectRule[]): string[] {
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
  const issues: string[] = []
  const seen = new Set<string>()
  for (const r of redirects) {
    if (seen.has(r.from)) issues.push(`重复源: ${r.from}`)
    seen.add(r.from)
    if (r.from === r.to) issues.push(`自环: ${r.from}`)
    if (![301, 302, 410].includes(r.status)) issues.push(`status 非法（301/302/410）: ${r.from}`)
    if (!known.has(r.to)) issues.push(`目标不存在: ${r.from} → ${r.to}`)
  }
  return issues
}

/**
 * 生成 _redirects（GitHub Pages / Netlify）与 nginx 规则片段。
 * 返回生成的文件路径。
 */
export function generateRedirectFiles(redirects: RedirectRule[]): { netlify: string; nginx: string } {
  const netlify = redirects.map((r) => `${r.from}  ${r.to}  ${r.status}`).join('\n')
  const nginx = redirects.map((r) => `location = ${r.from} { return ${r.status} ${r.to}; }`).join('\n\n')
  return { netlify: netlify ? `${netlify}\n` : '', nginx: nginx ? `${nginx}\n` : '' }
}

/** 一键：读取 yml → 校验 → 写入 public/_redirects 与 redirects/redirects.nginx.conf */
export function syncRedirectFiles(): { count: number; issues: string[] } {
  const redirects = loadRedirects()
  const issues = validateRedirects(redirects)
  if (issues.length > 0) return { count: redirects.length, issues }

  const { netlify, nginx } = generateRedirectFiles(redirects)
  const netlifyPath = join(process.cwd(), 'public', '_redirects')
  const nginxPath = join(process.cwd(), 'redirects', 'redirects.nginx.conf')
  writeFileSync(netlifyPath, netlify)
  writeFileSync(nginxPath, nginx)
  return { count: redirects.length, issues }
}

/** 供 dev 中间件使用：匹配请求路径的跳转规则 */
export function findRedirect(redirects: RedirectRule[], pathname: string): RedirectRule | undefined {
  return redirects.find((r) => r.from === normalizeRoute(pathname))
}

export { dirname }
