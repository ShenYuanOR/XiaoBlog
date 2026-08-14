import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import { registerIcons } from './icons'
import './styles/index.css'

registerIcons()

export default {
  Layout,
} satisfies Theme
