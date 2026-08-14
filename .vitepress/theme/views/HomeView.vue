<script setup lang="ts">
import PostCard from '../components/PostCard.vue'
import { groupByTag } from '../data'
import type { PostSummary } from '../data'

defineProps<{ posts: PostSummary[] }>()
</script>

<template>
  <div>
    <div class="x-home-list">
      <h2>最新文章</h2>
      <PostCard v-for="post in posts" :key="post.slug" :post="post" />
    </div>
    <div v-if="groupByTag(posts).length" class="x-home-tags">
      <h2>标签</h2>
      <div class="x-tag-cloud">
        <a v-for="g in groupByTag(posts)" :key="g.name" class="x-badge" :href="`/tags#${g.name}`">
          {{ g.name }}（{{ g.posts.length }}）
        </a>
      </div>
    </div>
  </div>
</template>
