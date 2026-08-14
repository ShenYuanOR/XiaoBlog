<script setup lang="ts">
import WidgetCard from './WidgetCard.vue'
import { groupByCategory } from '../data'
import { data as posts } from '../posts.data'

const categories = groupByCategory(posts).slice(0, 8)
</script>

<template>
  <WidgetCard v-if="categories.length" title="分类" icon="folder">
    <ul class="x-widget-list">
      <li v-for="g in categories" :key="g.name">
        <a :href="`/categories#${g.name}`">
          <span class="x-widget-list-name">{{ g.name }}</span>
          <span class="x-widget-count">{{ g.posts.length }}</span>
        </a>
      </li>
    </ul>
  </WidgetCard>
</template>
