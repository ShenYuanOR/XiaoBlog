<script setup lang="ts">
import { useData } from 'vitepress'
import { Icon } from '@iconify/vue'

const { site } = useData()

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function toggleTheme() {
  const dark = document.documentElement.classList.contains('dark')
  applyTheme(dark ? 'light' : 'dark')
  try {
    localStorage.setItem('xiao-theme', dark ? 'light' : 'dark')
  } catch {
    /* 忽略隐私模式异常 */
  }
}

function initTheme() {
  try {
    const saved = localStorage.getItem('xiao-theme')
    if (saved === 'light' || saved === 'dark') {
      applyTheme(saved)
      return
    }
  } catch {
    /* 忽略隐私模式异常 */
  }
  applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
}

if (typeof window !== 'undefined') initTheme()
</script>

<template>
  <div class="x-site">
    <header class="x-header">
      <div class="x-shell x-header-inner">
        <a href="/" class="x-site-name">{{ site.title }}</a>
        <nav class="x-nav">
          <a href="/archives">归档</a>
          <a href="/tags">标签</a>
          <a href="/categories">分类</a>
          <a href="/about">关于</a>
          <button class="x-theme-toggle" type="button" aria-label="切换主题" @click="toggleTheme">
            <Icon icon="mdi:white-balance-sunny" class="x-icon-sun" />
            <Icon icon="mdi:moon" class="x-icon-moon" />
          </button>
        </nav>
      </div>
    </header>

    <main class="x-main">
      <div class="x-shell">
        <slot />
      </div>
    </main>

    <footer class="x-footer">
      <div class="x-shell x-footer-inner">
        <span>© {{ new Date().getFullYear() }} {{ site.title }}</span>
        <span>Powered by 晓</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.x-icon-sun {
  display: none;
}

html.dark .x-icon-sun {
  display: inline;
}

html.dark .x-icon-moon {
  display: none;
}
</style>
