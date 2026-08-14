import { site } from '../site.config'
import { blog } from '../blog.config'

export function siteUrl(): string {
  return site.url.replace(/\/+$/, '')
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
