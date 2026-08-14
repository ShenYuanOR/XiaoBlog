<script setup lang="ts">
import { useData } from 'vitepress'
import { Content } from 'vitepress'
import SiteShell from './components/SiteShell.vue'
import PostView from './views/PostView.vue'
import AutoPageView from './views/AutoPageView.vue'
import NotFoundView from './views/NotFoundView.vue'

const { page, frontmatter } = useData()

function kind(): 'md' | 'post' | 'auto' | 'not-found' {
  const rel = page.value.relativePath
  if (rel === '404.md') return 'not-found'
  if (typeof frontmatter.value.autoPage === 'string') return 'auto'
  if (typeof frontmatter.value.slug === 'string' && frontmatter.value.slug) return 'post'
  return 'md'
}
</script>

<template>
  <SiteShell>
    <NotFoundView v-if="kind() === 'not-found'" />
    <PostView v-else-if="kind() === 'post'" />
    <AutoPageView v-else-if="kind() === 'auto'" :type="frontmatter.autoPage" />
    <div v-else class="x-md-page">
      <article class="post-prose" data-layout="page">
        <Content />
      </article>
    </div>
  </SiteShell>
</template>
