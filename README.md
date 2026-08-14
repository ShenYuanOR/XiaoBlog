# 晓

个人内容站框架：VitePress 只负责 Markdown 渲染、路由与静态构建，站点 UI、内容模型、SEO 与写作体验全部自持。

## 快速开始

```bash
pnpm install
pnpm dev        # 本地预览（默认开启局域网，端口占用自动递增）
pnpm new        # 发文向导
pnpm build      # 构建（内置 SEO 生成 + 校验，校验失败不出包）
```

## 文档

详细文档在 `docs/dev/`（不参与站点构建）：

| 文档 | 内容 |
|---|---|
| [docs/dev/usage.md](docs/dev/usage.md) | 使用说明：命令、写作流程、frontmatter、URL 策略、站点配置、发布 |
| [docs/dev/architecture.md](docs/dev/architecture.md) | 架构：三层结构、目录、数据流、关键约定、自动页扩展 |
| [docs/dev/theme.md](docs/dev/theme.md) | 主题开发：CSS layers、布局变体、页面分发、首页自定义、组件、图标、暗色 |
| [docs/dev/seo.md](docs/dev/seo.md) | SEO 管线：自动生成、校验门禁、redirects.yml、上线清单 |

## 目录结构

```
docs/                   # 博客内容（posts 文章 / 首页 / 独立页 / dev 开发文档）
.vitepress/
  config.ts             # VitePress 配置（rewrites、SEO 注入、构建钩子）
  site.config.ts        # 站点元数据（url / title / author / social）
  blog.config.ts        # 框架配置（布局变体、license、功能开关）
  engine/               # 框架核心（与主题无关）：url / posts / seo / validate / assets / automata
  theme/                # 参考主题（整体可替换）：Layout / components / views / styles
public/                 # 静态资源（文章图片 / 封面 / 头像）
scripts/                # new / tidy / validate / gen-redirects / gen-icons
redirects/redirects.yml # URL 迁移唯一事实来源
```
