export interface MigratedImage {
  /** md 中的原始引用（如 /posts/xxx/a.png 或 ./a.png） */
  ref: string
  /** 源文件绝对路径 */
  src: string
  /** 源文件是否存在 */
  exists: boolean
  /** 复制后的文件名（写入暂存区） */
  destName: string
}

export interface MigratedPost {
  title: string
  /** 墙钟格式 YYYY-MM-DD HH:mm:ss */
  date: string
  tags: string[]
  category?: string
  /** 源 frontmatter 已有 description */
  description?: string
  /** 候选 slug（可能需人工确认） */
  slug: string
  /** 旧站可访问 URL（提供 site-url 时） */
  oldUrl?: string
  /** 源文件名（去扩展名） */
  fileBase: string
  /** 正文（图片引用待改写） */
  content: string
  images: MigratedImage[]
  issues: string[]
}

export interface MigrationSource {
  name: 'valaxy' | 'hexo'
  /** 源文章目录（绝对路径） */
  postsDir: string
  /** 图片资源根目录（valaxy: public/） */
  publicDir?: string
  /** 旧站域名（如 https://example.com），用于生成 oldUrl 与 redirects */
  siteUrl?: string
  /** 保留源文件名（含日期前缀）作为 slug：旧 URL 不变，零重定向 */
  keepDateSlug?: boolean
}

export interface MigrationReport {
  sourceName: string
  posts: MigratedPost[]
  slugConflicts: string[]
  summary: {
    total: number
    missingDescription: number
    missingImages: number
    slugChanged: number
    redirects: number
  }
}

export interface ApplyResult {
  written: string[]
  skipped: string[]
  imagesCopied: number
  redirectsAdded: number
}
