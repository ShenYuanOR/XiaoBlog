import { defineConfig } from 'vitepress'
import { site } from './site.config'

export default defineConfig({
  lang: site.lang,
  title: site.title,
  description: site.description,
  cleanUrls: true,
  srcDir: 'docs',
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg' }],
  ],
})
