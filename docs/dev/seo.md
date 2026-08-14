---
title: SEO 管线
description: 自动生成、校验门禁、redirects.yml 与上线清单。
---

# SEO 管线

SEO 是「晓」的核心能力：**构建期自动生成、自动校验、失败拦截发布**。

## 自动生成（每页）

- `<title>`：`<frontmatter.title> | <site.title>`
- `<meta description>`：frontmatter.description
- `<link rel="canonical">`：绝对 URL（基于 site.url）
- 文章页追加：Open Graph（og:title/description/url/type/image）、Twitter Card、BlogPosting JSON-LD
- `noindex` 页：`<meta name="robots" content="noindex, nofollow">`

## 构建产物

| 文件 | 内容 | 来源 |
|---|---|---|
| `sitemap.xml` | 首页 + 自动页 + 全部已发布文章（含 lastmod/priority） | `engine/seo/sitemap.ts` |
| `atom.xml` | RSS 订阅（最新文章，标题/链接/摘要/作者） | `engine/seo/rss.ts` |
| `robots.txt` | Allow 全部 + Sitemap 声明 | `engine/seo/robots.ts` |

草稿与 noindex 文章自动排除在 sitemap/RSS 之外。

## 唯一 URL 来源

所有 URL（canonical / sitemap / RSS / 内部链接校验 / 重定向 target）都经过 `engine/url.ts`：

- `urlOf(route)`：绝对 URL（site.url + route）
- `postUrl(slug)`：`/posts/<slug>`
- 全站禁止手写第二处 URL 拼接，防止三处不一致

## 校验门禁（buildEnd，失败即中断构建）

- slug 重复、格式（小写 ASCII 连字符）
- 必填字段缺失（title/slug/date/description/tags）
- 日期格式、updated 早于 date
- layout 未注册
- 封面文件存在
- 内部链接死链（文章路由 + 独立页 + 自动页）
- 图片引用存在、命名规范（小写字母/数字/连字符/点）
- canonical 唯一性
- 构建产物 HTML 与路由清单 diff（漏页检查）

`pnpm validate` 是等价的独立 CLI（针对已构建产物）。

## 重定向（redirects.yml）

`redirects/redirects.yml` 是 **URL 迁移唯一事实来源**：

```yaml
redirects:
  - from: /posts/old-slug.html
    to: /posts/old-slug
    status: 301
```

- `pnpm gen:redirects` 生成 `public/_redirects`（GitHub Pages / Netlify 通用）+ `redirects/redirects.nginx.conf`
- 生成器校验：源不重复、无自环、目标存在（文章/自动页/首页）、status ∈ {301,302,410}
- 新站上线不需要任何重定向；仅当 slug 变更时登记，**禁止改旧文章 URL 而不登记**

## 上线清单

1. `site.config.ts` 填真实域名（canonical/sitemap/RSS 域名来源）
2. 推送触发 CI：build 内置校验，失败不发包
3. GitHub Pages 设置部署源为 GitHub Actions
4. Google Search Console：验证域名 → 提交 `/sitemap.xml`
5. 抽查线上 URL：文章 200、旧 URL（若有登记）301、不存在路径 404

## Roadmap（未实现）

- 站内搜索索引（buildEnd 生成 `search-index.json`，前端轻量组件）
- GitHub Pages `_redirects` 支持需要线上实测确认（Phase 0 遗留项）
