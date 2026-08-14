# 架构说明

「晓」是一个个人内容站框架：**VitePress 只负责 Markdown 渲染、路由与静态构建**，站点 UI、内容模型、SEO 与写作体验全部自持。

## 三层结构

```
engine/   框架核心（与任何主题无关）
theme/    参考主题（整体可替换）
content/  你的文章与站点配置（docs/）
```

- **engine** 不依赖 theme 的任何部分：替换主题不动引擎
- **theme** 是参考实现：改 tokens 换配色、改 layouts/views 换结构，可整体删除重写
- **content** 是纯 Markdown + frontmatter，引擎与主题只负责消费它

## 目录结构

```
docs/
  posts/                  # 文章（YYYY-MM-DD-<slug>.md），含 _assets/ 图片暂存区
  index.md                # 首页（内容完全自定义）
  about.md 等             # 独立页面
  dev/                    # 本项目开发文档（srcExclude 排除，不参与构建）
.vitepress/
  config.ts               # VitePress 配置（rewrites、SEO 注入、构建钩子、图片归位）
  site.config.ts          # 站点元数据（url/title/author/social）
  blog.config.ts          # 框架配置（布局变体、license、功能开关）
  engine/                 # 框架核心（Node 侧，构建期执行）
    url.ts                # 唯一 URL 计算函数
    posts.ts              # 文章加载、字段校验、日期归一化
    assets.ts             # 图片归位（暂存区 → public）
    automata.ts           # 自动页注册表（archives/tags/categories）
    validate.ts           # 发布前校验器
    seo/                  # head / sitemap / rss / robots 生成
  theme/                  # 参考主题（Vue 组件 + CSS layers）
    Layout.vue            # 布局分发（home/post/auto/md/404）
    components/           # 全局组件（md 中可直接使用）
    views/                # 文章页 / 自动页视图
    styles/               # cascade layers: reset → tokens → shell → prose → components
    posts.data.ts         # createContentLoader：文章数据（前端数据源）
    data.ts               # 分组工具（归档/标签/分类聚合）
    mdi-subset.json       # 图标子集（scripts/gen-icons.mjs 生成）
public/
  posts/<slug>/           # 文章图片（构建时自动归位目标）
  covers/                 # 封面图
  avatar.svg / favicon.svg
scripts/
  new.mjs                 # npm run new 发文向导
  tidy.mjs                # npm run tidy 图片手动整理
  validate.mjs            # npm run validate 独立校验 CLI
  gen-redirects.mjs       # redirects.yml → _redirects / nginx 规则
  gen-icons.mjs           # 图标子集生成器
redirects/redirects.yml   # URL 迁移唯一事实来源
.github/workflows/deploy.yml
```

## 数据流（构建期）

```
docs/posts/*.md
  ├─ engine/posts.ts（gray-matter 解析 + 校验）
  │    ├─ engine/seo/*（sitemap.xml / atom.xml / robots.txt 写入 dist）
  │    ├─ engine/validate.ts（校验门禁，失败则构建中止）
  │    └─ engine/automata.ts（自动页路由清单）
  ├─ config.ts rewrites（文件名 → slug 路由）
  ├─ config.ts transformPageData（每页注入 canonical/OG/JSON-LD）
  └─ theme/posts.data.ts（createContentLoader，前端渲染数据源）
```

构建钩子执行顺序：

1. `vite.buildStart` → `collectAssets()`：扫描 `docs/posts/_assets/<slug>/`，归位到 `public/posts/<slug>/`，并把 md 源文件的相对引用改写为绝对路径；随后 `syncTimestamps()` 自动补齐缺失的 date（文件创建时间）与过期的 updated（开关见 blog.config.feature）
2. `transformPageData` → 注入每页 head（title/description/canonical；文章页追加 OG/Twitter/JSON-LD；noindex 页加 noindex）
3. `buildEnd` → 全量校验（失败抛错中断构建）→ 写 sitemap.xml / atom.xml / robots.txt

## 关键约定

- **URL 与文件名解耦**：VitePress 按文件名生成路由，config.ts 用 `rewrites` 把 `posts/<文件名>` 映射到 `posts/<slug>`（frontmatter 声明）
- **slug 显式声明**：小写 ASCII 连字符、不含日期；发布后不可变，变更必须登记 `redirects.yml`
- **日期墙钟化**：gray-matter 会把日期解析成 Date，`posts.ts` 的 `toDateString` 转回本地墙钟字符串（禁止 toISOString，避免时区漂移）
- **draft 排除**：`srcExclude` 按 draft 状态排除文件；`pnpm dev:drafts` 可通过环境变量临时包含

## 自动页扩展

自动页 = 数据查询 + 占位 md + 主题视图：

1. `engine/automata.ts` 注册（name/route/title/groupBy）
2. `docs/` 建占位 md，frontmatter 标记 `autoPage: <name>`
3. 主题 `AutoPageView.vue` 增加对应分支
4. 路由自动进入 sitemap 与校验
