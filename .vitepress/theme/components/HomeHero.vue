<script setup lang="ts">
import { computed, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import { Icon } from '@iconify/vue'
import { site } from '../../site.config'

const { theme } = useData()

const initials = (site.author.name ?? site.title ?? '晓').slice(0, 1)
const imgFailed = ref(false)
const hasDevDocs = computed(() => theme.value?.hasDevDocs === true)
</script>

<template>
  <section class="x-home-hero">
    <div class="x-home-hero-avatar">
      <img
        v-if="site.author.avatar && !imgFailed"
        :src="withBase(site.author.avatar)"
        :alt="site.author.name"
        loading="eager"
        @error="imgFailed = true"
      />
      <span v-else>{{ initials }}</span>
    </div>
    <h1 class="x-home-hero-title">{{ site.title }}</h1>
    <p class="x-home-hero-subtitle">{{ site.subtitle }}</p>
    <p v-if="site.author.intro" class="x-home-hero-intro">{{ site.author.intro }}</p>
    <div class="x-home-hero-actions">
      <a class="x-hero-btn x-hero-btn-primary" :href="withBase('/archives')">
        <Icon icon="mdi:clock-outline" />全部文章
      </a>
      <a v-if="hasDevDocs" class="x-hero-btn x-hero-btn-ghost" :href="withBase('/dev')">
        <Icon icon="mdi:book-open-page-variant" />开发文档
      </a>
    </div>
  </section>
</template>
