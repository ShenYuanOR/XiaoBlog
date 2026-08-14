# 主题开发指南

## CSS Cascade Layers

样式按五层组织（`.vitepress/theme/styles/index.css` 引入）：

```
reset → tokens → shell → prose → components
```

- **reset**：全局 reset（box-sizing、字体、背景、`::selection`）
- **tokens**：全部设计变量（`--hue` 主色相、oklch 色彩体系、圆角、间距、阴影）——**改 tokens 即换整套主题**
- **shell**：站点外壳（导航、两栏网格、footer）
- **prose**：只作用于 `.post-prose` 内容域（文章排版 + 布局变体）
- **components**：所有组件样式

原则：

- 全局（非 `.post-prose`）禁止 h1/p/a/img 等标签选择器
- 组件样式只用 class 约束
- 文章 Markdown 排版只作用于 `.post-prose` 域（`<article class="post-prose" data-layout="...">`）
- prose 层的链接下划线等装饰必须限定 `:where(p, li, ...)` 或显式排除组件类，避免污染组件链接

## 布局变体

`blog.config.ts` 的 `layoutVariants` 注册；文章 frontmatter `layout: essay|note|page` 点名。变体 = `prose.css` 中 `[data-layout='xxx']` 的排版规则。未注册的 layout 名构建时校验报错（不允许静默降级）。

## 页面分发（Layout.vue）

`kind()` 按 frontmatter 分发：

| 判定 | 渲染 |
|---|---|
| `404.md` | NotFoundView |
| `frontmatter.home === true` | `.x-home` 纯内容（index.md 自定义布局） |
| `frontmatter.autoPage` | AutoPageView（归档/标签/分类） |
| `frontmatter.slug` | PostView（文章页，侧栏含 TOC 卡） |
| 其他 | `.post-prose` 渲染 md（独立页面） |

文章页与自动页走两栏网格（280px 侧栏 + 主栏），首页由 index.md 自行布局。

## 首页自定义

首页就是 `docs/index.md`，`frontmatter.home: true` 时不被两栏包裹，完全由内容控制：

- 任意 Markdown
- 全局组件：`<PostList />`（文章卡片列表，`:limit` 限数量）、`<HomeHero />`、`<ProfileCard />`、`<CategoryWidget />`、`<TagWidget />`、`<PostCard />`

## 新增全局组件

```ts
// .vitepress/theme/index.ts
import MyCard from './components/MyCard.vue'
app.component('MyCard', MyCard)
```

注册后即可在任意 md 中使用 `<MyCard />`。组件样式写入 `components.css`（components 层）或组件 scoped 样式。

## 文章数据

`theme/posts.data.ts` 用 `createContentLoader('posts/*.md')` 提供静态文章数组（构建期序列化）：

```ts
import { data as posts } from '../posts.data'
```

字段：title / slug / date / updated / description / tags / category / cover / layout / url。

`theme/data.ts` 提供分组工具：`groupByTag` / `groupByCategory` / `groupByDate`。

## 图标

- 组件用 `@iconify/vue` 的 `<Icon icon="mdi:xxx" />`
- 图标子集在 `mdi-subset.json`（避免打包全量 3MB MDI）
- 新增图标：把名字加入 `scripts/gen-icons.mjs` 的 `USED`，运行 `node scripts/gen-icons.mjs`
- 子集含 `width/height: 24`（MDI 坐标基准），缺失会导致图标被 16×16 裁切

## 暗色模式

- `html.dark` 类切换，tokens 里 `:root` / `html.dark` 两套变量
- `SiteShell.vue` 管理初始化（localStorage `xiao-theme` + 系统偏好）与切换按钮
- 新配色一律走 token 变量，不要写死颜色
