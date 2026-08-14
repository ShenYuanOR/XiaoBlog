<script setup lang="ts">
import WidgetCard from './WidgetCard.vue'
import { withBase } from 'vitepress'
import { groupByTag } from '../data'
import { data as posts } from '../posts.data'

const tags = groupByTag(posts).slice(0, 16)
</script>

<template>
  <WidgetCard v-if="tags.length" title="标签" icon="tag">
    <div class="x-widget-tags">
      <a v-for="g in tags" :key="g.name" class="x-badge" :href="withBase(`/tags#${g.name}`)">{{ g.name }}</a>
    </div>
  </WidgetCard>
</template>
