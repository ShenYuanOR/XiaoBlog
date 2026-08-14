<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { Content } from 'vitepress'
import { Icon } from '@iconify/vue'
import { blog } from '../../blog.config'
import { data as posts } from '../posts.data'

const { frontmatter } = useData()

const current = computed(() => frontmatter.value as Record<string, unknown>)
const layout = computed(() => (typeof current.value.layout === 'string' ? current.value.layout : 'essay'))

const index = computed(() => posts.findIndex((p) => p.slug === current.value.slug))
const prev = computed(() => (index.value > 0 ? posts[index.value - 1] : undefined))
const next = computed(() => (index.value >= 0 && index.value < posts.length - 1 ? posts[index.value + 1] : undefined))

function formatDate(date: string): string {
  const m = date.slice(0, 10).split('-')
  return m.length === 3 ? m.join('-') : date
}

const licenseText = computed(() => (typeof current.value.license === 'string' ? current.value.license : blog.license.default))
</script>

<template>
  <article class="x-post">
    <header class="x-post-head">
      <h1 class="x-post-title">{{ current.title }}</h1>
      <div class="x-post-meta">
        <span><Icon icon="mdi:calendar" />{{ formatDate(current.date as string) }}</span>
        <span v-if="current.updated"><Icon icon="mdi:clock-outline" />更新于 {{ formatDate(current.updated as string) }}</span>
        <span v-if="current.category">
          <Icon icon="mdi:folder" /><a :href="withBase(`/categories#${current.category}`)">{{ current.category }}</a>
        </span>
      </div>
    </header>

    <div class="post-prose" :data-layout="layout">
      <Content />
    </div>

    <footer>
      <div v-if="(current.tags as string[])?.length" class="x-tag-list" style="margin-top: 24px">
        <a v-for="tag in current.tags as string[]" :key="tag" class="x-badge" :href="withBase(`/tags#${tag}`)">
          <Icon icon="mdi:tag" />{{ tag }}
        </a>
      </div>

      <nav v-if="prev || next" class="x-pagination">
        <a v-if="prev" :href="withBase(prev.url)"><Icon icon="mdi:arrow-left" />{{ prev.title }}</a>
        <span v-else></span>
        <a v-if="next" :href="withBase(next.url)" class="x-pagination-next">{{ next.title }}<Icon icon="mdi:arrow-right" /></a>
      </nav>

      <div v-if="blog.license.enabled" class="x-license">
        本文采用 <a :href="blog.license.url" target="_blank" rel="noopener">{{ licenseText }}</a> 许可协议
      </div>
    </footer>
  </article>
</template>
