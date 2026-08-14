<script setup lang="ts">
import { useData, withBase } from 'vitepress'

const { site } = useData()
</script>

<template>
  <div class="x-404">
    <div class="x-404-title">404</div>
    <p class="x-404-desc">这里没有你要找的文章，可能它换地方了。</p>
    <a class="x-badge" :href="withBase('/')">返回 {{ site.title }} 首页</a>
  </div>
</template>
