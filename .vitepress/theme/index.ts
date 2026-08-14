import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import PostList from './components/PostList.vue'
import TagCloud from './components/TagCloud.vue'
import PostCard from './components/PostCard.vue'
import FeatureCard from './components/FeatureCard.vue'
import FeatureBadge from './components/FeatureBadge.vue'
import { registerIcons } from './icons'
import './styles/index.css'

registerIcons()

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('PostList', PostList)
    app.component('TagCloud', TagCloud)
    app.component('PostCard', PostCard)
    app.component('FeatureCard', FeatureCard)
    app.component('FeatureBadge', FeatureBadge)
  },
} satisfies Theme
