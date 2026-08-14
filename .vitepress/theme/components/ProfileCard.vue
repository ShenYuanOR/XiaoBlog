<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { site } from '../../site.config'

const initials = (site.author.name ?? '晓').slice(0, 1)
</script>

<template>
  <div class="x-widget">
    <div class="x-profile-avatar">
      <img v-if="site.author.avatar" :src="site.author.avatar" :alt="site.author.name" loading="lazy" />
      <span v-else>{{ initials }}</span>
    </div>
    <div class="x-profile-name">{{ site.author.name }}</div>
    <div class="x-profile-divider"></div>
    <div class="x-profile-bio">{{ site.author.intro || site.subtitle }}</div>
    <div v-if="site.social.length" class="x-profile-links">
      <a v-for="s in site.social" :key="s.name" :href="s.link" target="_blank" rel="me noopener" class="x-profile-link" :aria-label="s.name">
        <Icon icon="mdi:github" v-if="s.name.toLowerCase().includes('github')" />
        <Icon icon="mdi:email" v-else-if="s.name.toLowerCase().includes('mail')" />
        <Icon icon="mdi:heart" v-else />
      </a>
    </div>
  </div>
</template>
