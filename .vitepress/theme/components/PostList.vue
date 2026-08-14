<script setup lang="ts">
import { data as posts } from '../posts.data'
import PostCard from './PostCard.vue'

defineProps<{ limit?: number }>()
</script>

<template>
  <div class="x-post-list">
    <PostCard v-for="post in (limit ? posts.slice(0, limit) : posts)" :key="post.slug" :post="post" />
  </div>
</template>

<style scoped>
.x-post-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
