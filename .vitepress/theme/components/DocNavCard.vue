<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

const { page } = useData()
const currentPath = computed(() => {
  const rel = page.value?.relativePath ?? ''
  if (!rel.startsWith('dev/')) return ''
  const base = rel.replace(/^dev\//, '').replace(/\.md$/, '')
  return base === 'index' ? '/dev' : `/dev/${base}`
})

const items = [
  { name: '文档入口', path: '/dev' },
  { name: '使用说明', path: '/dev/usage' },
  { name: '架构说明', path: '/dev/architecture' },
  { name: '主题开发', path: '/dev/theme' },
  { name: 'SEO 管线', path: '/dev/seo' },
]
</script>

<template>
  <div class="x-widget">
    <div class="x-widget-title">文档</div>
    <ul class="x-widget-list">
      <li v-for="item in items" :key="item.path">
        <a :href="withBase(item.path)" :class="{ 'x-docnav-active': currentPath === item.path }">
          <span class="x-widget-list-name">{{ item.name }}</span>
        </a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.x-docnav-active {
  color: var(--primary) !important;
  background: var(--btn-plain-hover) !important;
}
</style>
