---
title: 晓
description: 「晓」个人内容站框架——自定义首页、文章、归档与主题能力的完整演示。
---

<div class="x-hero">

# 你好，这里是「晓」

一个属于你的内容站：写 Markdown 就好，路由、SEO、构建全自动。

<div class="x-hero-badges">

- [<FeatureBadge text="Markdown 写作" />](#)
- [<FeatureBadge text="自动 SEO" />](#)
- [<FeatureBadge text="自定主题" />](#)

</div>

</div>

## 最新文章

<PostList />

## 主题能力展示

下面是参考主题内置的全局组件，你可以在任何页面（md 文件）里直接使用，也可以注册自己的组件。

<div class="x-feature-grid">

<FeatureCard icon="pen" title="Markdown 写作" desc="标题、代码块、表格、引用、图片，专注内容本身，格式由框架统一排版。" />

<FeatureCard icon="shield-check" title="自动 SEO" desc="canonical、OG、JSON-LD、sitemap、RSS 自动生成，构建时校验门禁拦截问题。" />

<FeatureCard icon="palette" title="CSS 分层主题" desc="reset → tokens → shell → prose → components，改 tokens 即可换整套配色。" />

<FeatureCard icon="image" title="图片自动归位" desc="粘贴到 _assets 暂存区，构建时自动整理路径与命名，不再手写规范。" />

</div>

> 上面的卡片就是自定义组件 `<FeatureCard />` 的效果——组件写在 `.vitepress/theme/components/`，在 `theme/index.ts` 注册后即可在任意 md 中使用。

## 标签

<TagCloud />

## 组件如何注册

自己写一个组件，注册到主题入口即可在 md 中使用：

```vue
<!-- .vitepress/theme/components/MyCard.vue -->
<script setup lang="ts">
defineProps<{ text: string }>()
</script>
<template>
  <div class="my-card">{{ text }}</div>
</template>
```

```ts
// .vitepress/theme/index.ts
import MyCard from './components/MyCard.vue'

export default {
  Layout,
  enhanceApp({ app }) {
    app.component('MyCard', MyCard)   // ← 注册后 md 里写 <MyCard text="hi" />
  },
}
```
