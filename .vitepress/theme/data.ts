import type { PostSummary } from './posts.data'

export type { PostSummary } from './posts.data'

export interface TagGroup {
  name: string
  posts: PostSummary[]
}

export function groupByTag(posts: PostSummary[]): TagGroup[] {
  const map = new Map<string, PostSummary[]>()
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!map.has(tag)) map.set(tag, [])
      map.get(tag)!.push(post)
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, list]) => ({ name, posts: list }))
}

export interface CategoryGroup {
  name: string
  posts: PostSummary[]
}

export function groupByCategory(posts: PostSummary[]): CategoryGroup[] {
  const map = new Map<string, PostSummary[]>()
  for (const post of posts) {
    if (!post.category) continue
    if (!map.has(post.category)) map.set(post.category, [])
    map.get(post.category)!.push(post)
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, list]) => ({ name, posts: list }))
}

export interface ArchiveYear {
  year: string
  months: { month: string; posts: PostSummary[] }[]
}

export function groupByDate(posts: PostSummary[]): ArchiveYear[] {
  const years = new Map<string, Map<string, PostSummary[]>>()
  for (const post of posts) {
    const date = new Date(post.date)
    const year = String(date.getFullYear())
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (!years.has(year)) years.set(year, new Map())
    const months = years.get(year)!
    if (!months.has(month)) months.set(month, [])
    months.get(month)!.push(post)
  }
  const out: ArchiveYear[] = []
  for (const [year, months] of [...years.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    out.push({
      year,
      months: [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, list]) => ({ month, posts: list })),
    })
  }
  return out
}
