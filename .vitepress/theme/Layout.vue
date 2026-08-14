<script setup lang="ts">
import { useData } from 'vitepress'
import { Content } from 'vitepress'
import SiteShell from './components/SiteShell.vue'
import { data as posts } from './posts.data'
import HomeView from './views/HomeView.vue'
import PostView from './views/PostView.vue'
import AutoPageView from './views/AutoPageView.vue'
import NotFoundView from './views/NotFoundView.vue'

const { page, frontmatter } = useData()

function kind(): 'home' | 'post' | 'auto' | 'page' | 'not-found' {
  const rel = page.value.relativePath
  if (rel === '404.md') return 'not-found'
  if (rel === 'index.md') return 'home'
  if (typeof frontmatter.value.autoPage === 'string') return 'auto'
  if (typeof frontmatter.value.slug === 'string' && frontmatter.value.slug) return 'post'
  return 'page'
}
</script>

<template>
  <SiteShell>
    <NotFoundView v-if="kind() === 'not-found'" />
    <HomeView v-else-if="kind() === 'home'" :posts="posts" />
    <PostView v-else-if="kind() === 'post'" :posts="posts" />
    <AutoPageView v-else-if="kind() === 'auto'" :type="frontmatter.autoPage" :posts="posts" />
    <div v-else>
      <div class="x-page-title">{{ frontmatter.title }}</div>
      <p v-if="frontmatter.description" class="x-page-desc">{{ frontmatter.description }}</p>
      <article class="post-prose" data-layout="page">
        <Content />
      </article>
    </div>
  </SiteShell>
</template>
