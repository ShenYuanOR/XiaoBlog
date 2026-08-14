# 使用说明

## 环境要求

- Node.js ≥ 20（推荐 22+，项目在 Node 24 下开发）
- pnpm ≥ 9

```bash
pnpm install
```

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 本地预览（草稿默认隐藏），默认开启局域网访问，端口占用自动递增 |
| `pnpm dev:drafts` | 本地预览（包含草稿） |
| `pnpm new` | 发文向导 |
| `pnpm tidy` | 手动归位暂存区图片（构建时自动执行，一般用不到） |
| `pnpm build` | 构建（内置 SEO 生成 + 校验，校验失败不出包） |
| `pnpm preview` | 预览构建产物 |
| `pnpm validate` | 单独运行校验器（需先 build） |
| `pnpm gen:redirects` | 生成重定向规则（redirects.yml → `_redirects` + nginx） |

## 写作流程

1. `pnpm new`，按向导填写：标题 → slug（拼音转写 + 手改确认）→ 日期/摘要/分类/标签/封面/draft/layout
2. 编辑 `docs/posts/<date>-<slug>.md`
3. 图片：粘贴/拖入 `docs/posts/_assets/<slug>/`，正文写相对路径 `![](./_assets/<slug>/xxx.png)`；
   构建时自动归位到 `public/posts/<slug>/` 并把 URL 改写为 `/posts/<slug>/xxx.png`
4. `pnpm dev` 预览（`pnpm dev:drafts` 可预览草稿）
5. `pnpm build` 全绿后提交推送，CI 自动构建发布

## frontmatter Schema

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 文章标题（正文不要再写一级标题，避免与页面 H1 重复） |
| `slug` | 是 | 稳定 ASCII slug，决定 URL `/posts/<slug>`；发布后不可改，改动需登记 redirects.yml |
| `date` | 是 | `YYYY-MM-DD [HH:mm:ss]`，解析后按本地墙钟保留 |
| `description` | 是 | 摘要，用于 meta/OG/sitemap/RSS |
| `tags` | 是 | 标签数组 |
| `updated` | 否 | 更新时间，不得早于 date |
| `category` | 否 | 分类（单值） |
| `cover` | 否 | 封面，public 内路径（如 `/covers/xxx.png`） |
| `draft` | 否 | 草稿：dev 隐藏、build 排除、不进 sitemap/RSS |
| `noindex` | 否 | 构建但禁止收录 |
| `layout` | 否 | `essay` / `note` / `page`，默认 essay；未注册名构建报错 |
| `license` | 否 | 覆盖全局版权默认值（blog.config.ts） |

## URL 策略（不可配置底线）

- 文章：`/posts/<slug>`（无后缀、无尾斜杠）
- 自动页：`/archives` `/tags` `/categories`
- 独立页面：`/about` 等（docs/ 根目录 md）
- 静态：`/sitemap.xml` `/atom.xml` `/robots.txt` `/404.html`
- URL 与文件名、标题、日期完全解耦；文件名只是仓库整理工具

## 站点配置

`.vitepress/site.config.ts`：

```ts
export const site: SiteConfig = {
  url: 'https://你的域名',        // ← 上线前必填，canonical/sitemap/RSS 都基于它
  lang: 'zh-CN',
  title: '晓',
  subtitle: '一句话副标题',
  description: '站点描述',
  author: { name: '你的名字', avatar: '/avatar.png', intro: '一句简介' },
  social: [{ name: 'GitHub', link: 'https://github.com/xxx' }],
  since: 2026,
}
```

`.vitepress/blog.config.ts`：布局变体注册、license 默认值、功能开关（darkMode / vercount）。

## 草稿与 noindex

- `draft: true`：不构建、不进 sitemap/RSS；仓库公开时文件本身可见（接受的取舍）
- `noindex: true`：正常构建，但 head 加 `noindex, nofollow` 且排除 sitemap

## 发布

1. `site.config.ts` 填入真实域名
2. 推送 main 分支，GitHub Actions：`install → gen:redirects → build（含校验）→ validate → deploy-pages`
3. GitHub 仓库 Pages 设置选择 **GitHub Actions** 部署源
4. 上线后在 Google Search Console 验证域名并提交 `/sitemap.xml`
5. `redirects.yml` 为空即无需任何重定向（slug 未变过）
