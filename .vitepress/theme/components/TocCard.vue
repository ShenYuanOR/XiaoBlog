<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { page } = useData()

const headers = computed(() => (page.value.headers as { level: number; title: string; slug: string }[]) ?? [])
const showToc = computed(() => headers.value.length >= 2)
</script>

<template>
  <div v-if="showToc" class="x-widget">
    <div class="x-widget-title">目录</div>
    <nav class="x-toc">
      <ul>
        <li v-for="h in headers" :key="h.slug" :style="{ paddingLeft: `${(h.level - 2) * 12}px` }">
          <a :href="`#${h.slug}`">{{ h.title }}</a>
        </li>
      </ul>
    </nav>
  </div>
</template>
