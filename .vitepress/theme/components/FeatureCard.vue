<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  title: string
  desc: string
  icon?: string
}>()
</script>

<template>
  <div class="x-feature-card">
    <div v-if="icon" class="x-feature-icon">
      <Icon :icon="`mdi:${icon}`" />
    </div>
    <h3>{{ title }}</h3>
    <p>{{ desc }}</p>
  </div>
</template>
