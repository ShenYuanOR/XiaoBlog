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
      <div v-if="post.cover" class="x-post-card-cover">
        <img :src="post.cover" :alt="post.title" loading="lazy" />
      </div>
      <div class="x-post-card-body">
        <div class="x-post-card-time">{{ formatDate(post.date) }}</div>
        <h3 class="x-post-card-title">{{ post.title }}</h3>
        <p class="x-post-card-desc">{{ post.description }}</p>
        <div class="x-post-card-meta">
          <span v-if="post.category" class="x-badge"><Icon icon="mdi:folder" />{{ post.category }}</span>
          <a v-for="tag in post.tags.slice(0, 4)" :key="tag" class="x-badge" :href="`/tags#${tag}`">
            <Icon icon="mdi:tag" />{{ tag }}
          </a>
        </div>
      </div>
    </a>
  </article>
</template>

<style scoped>
.x-post-card-link {
  display: block;
  height: 100%;
}

.x-post-card-cover {
  margin: calc(-1 * var(--space-5)) calc(-1 * var(--space-5)) var(--space-4);
  aspect-ratio: 16 / 7;
  overflow: hidden;
}

.x-post-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.x-post-card:hover .x-post-card-cover img {
  transform: scale(1.04);
}
</style>
