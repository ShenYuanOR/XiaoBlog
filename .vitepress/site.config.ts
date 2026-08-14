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
  url: 'https://example.com',
  lang: 'zh-CN',
  title: '晓',
  subtitle: '一个安静的个人内容站',
  description: '「晓」框架的个人博客，记录技术、生活与思考。',
  author: {
    name: 'Shen Yuan',
    avatar: '/avatar.png',
    intro: '',
  },
  social: [
    {
      name: 'GitHub',
      link: 'https://github.com/ShenYuanOL',
    },
  ],
  since: 2026,
}
