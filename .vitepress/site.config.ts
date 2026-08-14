export interface SiteConfig {
  url: string
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
  url: 'https://shenyuanor.github.io/XiaoBlog',
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
