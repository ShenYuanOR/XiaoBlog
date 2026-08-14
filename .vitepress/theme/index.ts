import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import PostList from './components/PostList.vue'
import TagCloud from './components/TagCloud.vue'
import PostCard from './components/PostCard.vue'
import { registerIcons } from './icons'
import './styles/index.css'

registerIcons()

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('PostList', PostList)
    app.component('TagCloud', TagCloud)
    app.component('PostCard', PostCard)
  },
} satisfies Theme
