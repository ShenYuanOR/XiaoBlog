<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { groupByCategory, groupByTag } from '../data'
import { data as posts } from '../posts.data'

defineProps<{
  title: string
  icon?: string
}>()
</script>

<template>
  <div class="x-widget">
    <div class="x-widget-title">
      <span v-if="icon" class="x-widget-title-icon"><Icon :icon="`mdi:${icon}`" /></span>
      {{ title }}
    </div>
    <div class="x-widget-body">
      <slot />
    </div>
  </div>
</template>
