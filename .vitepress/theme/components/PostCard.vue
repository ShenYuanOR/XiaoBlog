<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { PostSummary } from '../data'

defineProps<{ post: PostSummary }>()

function formatDate(date: string): string {
  const m = date.slice(0, 10).split('-')
  return m.length === 3 ? m.join('-') : date
}
</script>

<template>
  <article class="x-post-card">
    <a :href="post.url" class="x-post-card-link">
      <div class="x-post-card-main">
        <h3 class="x-post-card-title">{{ post.title }}<Icon class="x-post-card-arrow" icon="mdi:arrow-right" /></h3>
        <div class="x-post-meta">
          <span><Icon icon="mdi:calendar" />{{ formatDate(post.date) }}</span>
          <span v-if="post.category"><Icon icon="mdi:folder" />{{ post.category }}</span>
          <span v-if="post.tags.length"><Icon icon="mdi:tag" />{{ post.tags.slice(0, 3).join(' / ') }}</span>
        </div>
        <p class="x-post-card-desc">{{ post.description }}</p>
      </div>
      <div v-if="post.cover" class="x-post-card-cover">
        <img :src="post.cover" :alt="post.title" loading="lazy" />
      </div>
    </a>
  </article>
</template>

<style scoped>
.x-post-card-link {
  display: flex;
  gap: 20px;
  align-items: stretch;
}

.x-post-card-main {
  flex: 1;
  min-width: 0;
}

.x-post-card-cover {
  flex-shrink: 0;
  width: 28%;
  max-width: 220px;
  border-radius: var(--radius-medium);
  overflow: hidden;
  align-self: center;
}

.x-post-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.x-post-card:hover .x-post-card-cover img {
  transform: scale(1.06);
}

.x-post-card-arrow {
  display: inline-block;
  margin-left: 6px;
  vertical-align: -3px;
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.x-post-card:hover .x-post-card-arrow {
  opacity: 1;
  transform: translateX(0);
}

@media (max-width: 640px) {
  .x-post-card-cover {
    width: 88px;
  }
}
</style>
