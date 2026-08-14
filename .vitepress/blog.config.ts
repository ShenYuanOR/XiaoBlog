export type PostLayout = 'essay' | 'note' | 'page'

export interface LayoutVariant {
  name: PostLayout
  label: string
}

export interface BlogConfig {
  filename: {
    datePrefix: 'YYYY-MM-DD'
  }
  url: {
    postBase: '/posts'
  }
  layoutVariants: LayoutVariant[]
  license: {
    enabled: boolean
    default: string
    url: string
  }
  feature: {
    darkMode: boolean
    vercount: boolean
  }
}

export const blog: BlogConfig = {
  filename: {
    datePrefix: 'YYYY-MM-DD',
  },
  url: {
    postBase: '/posts',
  },
  layoutVariants: [
    { name: 'essay', label: '长文' },
    { name: 'note', label: '随笔' },
    { name: 'page', label: '独立页面' },
  ],
  license: {
    enabled: true,
    default: 'CC BY-NC-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  feature: {
    darkMode: true,
    vercount: false,
  },
}
