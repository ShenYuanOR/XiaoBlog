<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { PostSummary } from '../data'

defineProps<{ post: PostSummary }>()

function formatDate(date: string): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <article class="x-post-card">
    <a :href="post.url" class="x-post-card-link">
      <div class="x-post-card-time">{{ formatDate(post.date) }}</div>
      <h3 class="x-post-card-title">{{ post.title }}</h3>
      <p class="x-post-card-desc">{{ post.description }}</p>
      <div class="x-post-card-meta">
        <span v-if="post.category" class="x-badge"><Icon icon="mdi:folder" />{{ post.category }}</span>
        <a v-for="tag in post.tags.slice(0, 4)" :key="tag" class="x-badge" :href="`/tags#${tag}`">
          <Icon icon="mdi:tag" />{{ tag }}
        </a>
      </div>
    </a>
  </article>
</template>

<style scoped>
.x-post-card-link {
  display: block;
}
</style>
