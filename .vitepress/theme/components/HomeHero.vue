<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { site } from '../../site.config'

const initials = (site.author.name ?? site.title ?? '晓').slice(0, 1)
const imgFailed = ref(false)
</script>

<template>
  <section class="x-home-hero">
    <div class="x-home-hero-glow" aria-hidden="true"></div>
    <div class="x-home-hero-inner">
      <div class="x-home-hero-avatar">
        <img
          v-if="site.author.avatar && !imgFailed"
          :src="site.author.avatar"
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
        <a class="x-hero-btn x-hero-btn-primary" href="#latest">
          <Icon icon="mdi:book-open-page-variant" />阅读文章
        </a>
        <a class="x-hero-btn x-hero-btn-ghost" href="/about">
          <Icon icon="mdi:account-heart" />关于我
        </a>
      </div>
    </div>
  </section>
</template>
