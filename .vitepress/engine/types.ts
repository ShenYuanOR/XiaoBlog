import type { PostLayout } from '../blog.config.ts'

export interface PostFrontmatter {
  title: string
  slug: string
  date: string
  description: string
  tags: string[]
  updated?: string
  category?: string
  cover?: string
  draft?: boolean
  noindex?: boolean
  layout?: PostLayout
  license?: string
}

export interface PostData {
  frontmatter: PostFrontmatter
  content: string
  fileBase: string
  route: string
  url: string
}
