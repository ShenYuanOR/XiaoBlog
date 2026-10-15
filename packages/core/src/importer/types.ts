export interface MigratedImage {
  /** Markdown 里的原始引用。 */
  ref: string;
  /** 源文件绝对路径。 */
  src: string;
  exists: boolean;
  /** 放进文章目录后的文件名。 */
  destName: string;
}

export interface MigratedPost {
  title: string;
  /** 墙钟时间 YYYY-MM-DD HH:mm:ss。 */
  date: string;
  updated?: string;
  tags: string[];
  category?: string;
  description?: string;
  draft: boolean;
  slug: string;
  /** 旧站完整 URL（提供 siteUrl 时）。 */
  oldUrl?: string;
  /** 1.x 文件名路径，与新 URL 不同才需要重定向。 */
  legacyPaths: string[];
  fileBase: string;
  content: string;
  images: MigratedImage[];
  issues: string[];
}

export interface MigrationSource {
  name: 'valaxy' | 'hexo' | 'xiao';
  postsDir: string;
  /** 图片根目录。Valaxy / 1.x 为站点 public/。 */
  publicDir?: string;
  /** 1.x 暂存图目录，默认 postsDir/_assets。 */
  assetsDir?: string;
  siteUrl?: string;
  /** 保留带日期的文件名作 slug。 */
  keepDateSlug?: boolean;
}

export interface MigrationReport {
  sourceName: string;
  posts: MigratedPost[];
  slugConflicts: string[];
  summary: {
    total: number;
    missingDescription: number;
    missingImages: number;
    slugChanged: number;
    redirects: number;
  };
}

export interface ApplyOptions {
  /** 目标文章目录，例如 src/content/posts。 */
  contentDir: string;
  /** 要合并重定向的 xiao.config.json。 */
  configPath: string;
  /** 1.x redirects.yml，可空。 */
  redirectsFile?: string;
}

export interface ApplyResult {
  written: string[];
  skipped: string[];
  imagesCopied: number;
  redirectsAdded: number;
}
