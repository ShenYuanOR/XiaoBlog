import { loadPosts } from './posts.ts'
import type { PostData } from './types.ts'

export interface AutoPageDef {
  name: string
  route: string
  title: string
}

export interface AutoPageData extends AutoPageDef {
  posts: PostData[]
  groups: Map<string, PostData[]>
}

export type GroupBy = 'none' | 'tag' | 'category'

export interface AutoPageEntry {
  def: AutoPageDef
  groupBy: GroupBy
  posts: PostData[]
}

const registry = new Map<string, AutoPageEntry>()

export function registerAutoPage(name: string, def: AutoPageDef, groupBy: GroupBy = 'none'): void {
  registry.set(name, { def, groupBy, posts: [] })
}

export function getAutoPages(): AutoPageEntry[] {
  return [...registry.values()]
}

export function autoPageRoutes(): string[] {
  return [...registry.values()].map((e) => e.def.route)
}

export function buildAutoPagesData(): AutoPageData[] {
  const posts = loadPosts()
  return [...registry.values()].map((entry) => {
    const groups = new Map<string, PostData[]>()
    if (entry.groupBy === 'none') {
      return { ...entry.def, posts, groups }
    }
    for (const post of posts) {
      if (entry.groupBy === 'tag') {
        for (const tag of post.frontmatter.tags) {
          if (!groups.has(tag)) groups.set(tag, [])
          groups.get(tag)!.push(post)
        }
      } else if (post.frontmatter.category) {
        const cat = post.frontmatter.category
        if (!groups.has(cat)) groups.set(cat, [])
        groups.get(cat)!.push(post)
      }
    }
    return { ...entry.def, posts: [], groups }
  })
}

export function registerBuiltinAutoPages(): void {
  registerAutoPage('archives', { name: 'archives', route: '/archives', title: '归档' })
  registerAutoPage('tags', { name: 'tags', route: '/tags', title: '标签' }, 'tag')
  registerAutoPage('categories', { name: 'categories', route: '/categories', title: '分类' }, 'category')
}

export function autoPageRoute(name: string): string {
  return registry.get(name)?.def.route ?? ''
}
