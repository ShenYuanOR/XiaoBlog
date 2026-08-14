<script setup lang="ts">
import { groupByTag } from '../data'
import { data as posts } from '../posts.data'
</script>

<template>
  <div class="x-tag-cloud">
    <a v-for="g in groupByTag(posts)" :key="g.name" class="x-badge" :href="`/tags#${g.name}`">
      {{ g.name }}（{{ g.posts.length }}）
    </a>
  </div>
</template>
