# 晓

个人内容站框架：VitePress 只负责 Markdown 渲染、路由与静态构建，站点 UI、内容模型、SEO 与写作体验全部自持。

## 目录结构

```
docs/
  posts/                  # 文章（YYYY-MM-DD-<slug>.md）
  about.md                # 独立页面（layout: page）
  archives.md / tags.md / categories.md   # 自动页占位
.vitepress/
  config.ts               # VitePress 配置（rewrites、SEO 注入、校验、构建钩子）
  site.config.ts          # 站点元数据（url / title / author / social）
  blog.config.ts          # 框架配置（日期格式、布局变体、license、功能开关）
  engine/                 # 框架核心（与主题无关）
    url.ts                # 唯一 URL 计算函数
    posts.ts              # 文章加载与字段校验
    seo/                  # head / sitemap / rss / robots
    validate.ts           # 发布前校验器
    assets.ts             # 图片归位
    automata.ts           # 自动页注册表
  theme/                  # 参考主题（整体可替换）
    layouts/ components/ views/ styles/   # cascade layers: reset → tokens → shell → prose → components
public/
  posts/<slug>/           # 文章图片（构建时自动归位）
  covers/                 # 封面图
scripts/
  new.mjs                 # npm run new 发文向导
  tidy.mjs                # npm run tidy 图片整理
  validate.mjs            # npm run validate 独立校验
  gen-redirects.mjs       # redirects.yml → _redirects / nginx 规则
redirects/redirects.yml   # URL 变更唯一事实来源
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 本地预览（草稿默认隐藏） |
| `pnpm dev:drafts` | 本地预览（包含草稿） |
| `pnpm new` | 发文向导：标题 → slug（拼音转写+手改）→ 字段采集 → 生成文章 + 预建图片目录 |
| `pnpm tidy` | 手动归位暂存区图片（构建时自动执行，一般用不到） |
| `pnpm build` | 构建（内置 SEO 生成 + 校验，校验失败不出包） |
| `pnpm validate` | 单独运行校验器（需先 build） |
| `pnpm gen:redirects` | 生成重定向规则 |

## 写作流程

1. `pnpm new`，按向导填写（title / slug / date / description / tags / category / cover / layout / draft）
2. 编辑 `docs/posts/<date>-<slug>.md`
3. 图片：粘贴/拖入 `docs/posts/_assets/<slug>/`，正文写相对路径 `![](./_assets/<slug>/xxx.png)`；
   构建时自动归位到 `public/posts/<slug>/` 并把 URL 改写为 `/posts/<slug>/xxx.png`
4. `pnpm dev` 预览（`pnpm dev:drafts` 可预览草稿）
5. `pnpm build`，全绿后提交推送，CI 构建发布

## frontmatter Schema

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 文章标题 |
| `slug` | 是 | 稳定 ASCII slug，决定 URL `/posts/<slug>`；发布后不可改，改动需登记 redirects.yml |
| `date` | 是 | `YYYY-MM-DD [HH:mm:ss]` |
| `description` | 是 | 摘要，用于 meta/OG/sitemap/RSS |
| `tags` | 是 | 标签数组 |
| `updated` | 否 | 更新时间，不得早于 date |
| `category` | 否 | 分类 |
| `cover` | 否 | 封面，public 内路径 |
| `draft` | 否 | 草稿：dev 隐藏、build 排除、不进 sitemap/RSS |
| `noindex` | 否 | 构建但禁止收录 |
| `layout` | 否 | `essay` / `note` / `page`，默认 essay；未注册名构建报错 |
| `license` | 否 | 覆盖全局版权默认值 |

## URL 策略

- 文章：`/posts/<slug>`（无后缀、无尾斜杠）
- 自动页：`/archives` `/tags` `/categories`
- 独立页面：`/about` 等
- 静态：`/sitemap.xml` `/atom.xml` `/robots.txt` `/404.html`
- URL 与文件名、标题、日期完全解耦；文件名只是仓库整理工具

## SEO 管线

- 每页自动生成：title、description、绝对 canonical、Open Graph、Twitter Card
- 文章页额外生成 BlogPosting JSON-LD
- 构建自动产出：sitemap.xml、atom.xml、robots.txt
- 草稿与 noindex 自动排除
- 校验器（构建门禁，失败不出包）：重复 slug、必填字段、slug/日期格式、layout 注册、内部死链、图片引用与命名、canonical 唯一、sitemap 与产物 diff、redirects 目标存在
- `site.config.ts` 的 `url` 是 canonical/sitemap/RSS 的域名来源，上线前必须填真实域名

## 布局变体

- `essay` 长文（默认）、`note` 随笔（紧凑）、`page` 独立页面（宽版）
- 变体注册在 `blog.config.ts` 的 `layoutVariants`；每篇文章只能点名已注册变体
- 文章排版样式只作用于 `.post-prose` 内容域，全局只有 reset/tokens/字体/暗色

## 发布

- GitHub Actions：`install → build（含校验） → deploy-pages`
- 产物宿主无关：`redirects.yml` 可生成 `_redirects`（GitHub Pages / Netlify）与 nginx 规则
- 上线清单：真实域名填入 site.config.ts → 提交 sitemap 至 Google Search Console → 逐 URL 抽查

## 自定义主题

- 参考主题在 `.vitepress/theme/`，整体可替换：改 tokens 换配色、改 layouts/views 换结构
- 引擎（`.vitepress/engine/`）不依赖主题任何部分，替换主题不动引擎
- 新增自动页：在 `engine/automata.ts` 注册 + `docs/` 建占位 md（frontmatter 标记 `autoPage`）+ 主题中增加对应视图分支

## 自定义首页

首页就是 `docs/index.md`，内容完全由你掌控，可任意组合：

- 普通 Markdown：标题、段落、图片、引用、代码块
- 全局组件（`.vitepress/theme/index.ts` 注册，md 中直接使用）：
  - `<PostList />` 文章卡片列表（`:limit="2"` 限制数量）
  - `<TagCloud />` 标签云
  - `<PostCard :post="post" />` 单篇卡片
- 新增自己的首页组件：写入 `.vitepress/theme/components/`，在 `theme/index.ts` 的 `enhanceApp` 注册，即可在首页 md 中使用
