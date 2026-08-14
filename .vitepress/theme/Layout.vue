<script setup lang="ts">
import { useData } from 'vitepress'
import { Content } from 'vitepress'
import SiteShell from './components/SiteShell.vue'
import SiteSidebar from './components/SiteSidebar.vue'
import TocCard from './components/TocCard.vue'
import DocNavCard from './components/DocNavCard.vue'
import PostView from './views/PostView.vue'
import AutoPageView from './views/AutoPageView.vue'
import NotFoundView from './views/NotFoundView.vue'

const { page, frontmatter } = useData()

function kind(): 'md' | 'post' | 'auto' | 'home' | 'doc' | 'not-found' {
  const rel = page.value.relativePath
  if (rel === '404.md') return 'not-found'
  if (frontmatter.value.home === true) return 'home'
  if (rel.startsWith('dev/')) return 'doc'
  if (typeof frontmatter.value.autoPage === 'string') return 'auto'
  if (typeof frontmatter.value.slug === 'string' && frontmatter.value.slug) return 'post'
  return 'md'
}
</script>

<template>
  <SiteShell>
    <NotFoundView v-if="kind() === 'not-found'" />
    <div v-else-if="kind() === 'home'" class="x-home">
      <Content />
    </div>
    <div v-else class="x-two-col">
      <aside class="x-side-col">
        <DocNavCard v-if="kind() === 'doc'" />
        <TocCard v-if="kind() === 'post'" />
        <SiteSidebar v-if="kind() !== 'doc'" />
      </aside>
      <div class="x-main-col">
        <PostView v-if="kind() === 'post'" />
        <AutoPageView v-else-if="kind() === 'auto'" :type="frontmatter.autoPage" />
        <article v-else class="post-prose" data-layout="page">
          <Content />
        </article>
      </div>
    </div>
  </SiteShell>
</template>
