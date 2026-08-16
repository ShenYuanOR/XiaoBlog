import { site } from '../site.config.ts'
import { blog } from '../blog.config.ts'

export function siteUrl(): string {
  return site.url.replace(/\/+$/, '')
}

/**
 * VitePress `base`：默认 `/`，不从 url 自动抠路径、不写死仓库名。
 * 仅当 site.config 显式配置了 base（如本演示站 `/XiaoBlog/`）时才使用子路径。
 * 自定义域名、github.io 根站等正常使用都保持无前缀。
 */
export function siteBase(): string {
  const raw = (site.base ?? '/').trim() || '/'
  if (raw === '/') return '/'
  const withLead = raw.startsWith('/') ? raw : `/${raw}`
  return withLead.endsWith('/') ? withLead : `${withLead}/`
}

export function urlOf(route: string): string {
  return siteUrl() + normalizeRoute(route)
}

export function normalizeRoute(route: string): string {
  let r = route.replace(/\\/g, '/')
  if (!r.startsWith('/')) r = '/' + r
  r = r.replace(/\/+/g, '/')
  if (r.length > 1 && r.endsWith('/')) r = r.slice(0, -1)
  if (r === '/index') r = '/'
  return r
}

export function postUrl(slug: string): string {
  return normalizeRoute(`${blog.url.postBase}/${slug}`)
}

export function isExternal(href: string): boolean {
  return /^(https?:)?\/\//.test(href) || href.startsWith('mailto:') || href.startsWith('tel:')
}
