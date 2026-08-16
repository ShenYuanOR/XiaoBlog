export interface SiteConfig {
  /** 站点根 URL（勿尾斜杠），canonical / sitemap / RSS 用 */
  url: string
  /**
   * 部署路径前缀（VitePress base）。默认 `/`，绝大多数站点（含 github.io 根站、自定义域名）不用改。
   * 仅当站点挂在「非根」子路径时才填写，例如本演示站的 `/XiaoBlog/`。
   */
  base?: string
  lang: string
  title: string
  subtitle: string
  description: string
  author: {
    name: string
    avatar: string
    intro: string
  }
  social: {
    name: string
    link: string
  }[]
  since: number
}

export const site: SiteConfig = {
  // 演示站完整地址（含子路径，供 SEO 绝对链接）
  url: 'https://shenyuanor.github.io/XiaoBlog',
  // 仅本演示站需要：挂在 shenyuanor.github.io 的多项目子路径下。
  // 你自己的站请删掉 base，或保持默认 `/`（github.io 根站 / 自定义域名都不用前缀）。
  base: '/XiaoBlog/',
  lang: 'zh-CN',
  title: '晓',
  subtitle: '一个安静的个人内容站',
  description: '「晓」框架的个人博客与开发文档，记录技术、生活与思考。',
  author: {
    name: 'Shen Yuan',
    avatar: '/avatar.svg',
    intro: '一个安静写代码的人。',
  },
  social: [
    {
      name: 'GitHub',
      link: 'https://github.com/ShenYuanOL',
    },
  ],
  since: 2026,
}
