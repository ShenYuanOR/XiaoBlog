# 晓 · XiaoBlog 2.0

个人内容站框架：**桌面应用负责写作与建站，产物是一个标准 Astro 站点**。

- 桌面端（`apps/studio`）：Electron + Vue 3。写文章（所见即所得 + 源码）、拖拽搭页面、调主题样式、SEO 体检、一键发布到 Gitea / GitHub Pages。
- 产物（`packages/template`）：纯标准 Astro 项目，不依赖本程序，用任何编辑器打开、`pnpm build`、部署到任意静态托管。
- 1.x 的 VitePress 版本已归档在 tag `v1-vitepress`，新功能只在 `v2` 分支。

**在线演示：** [https://shenyuanor.github.io/XiaoBlog/](https://shenyuanor.github.io/XiaoBlog/)（由 `examples/demo` 构建）

## 快速开始

```bash
pnpm install

# 桌面应用（开发模式）
cd apps/studio
pnpm dev

# 站点模板单独构建
cd packages/template
pnpm exec astro build
```

要求 Node ≥ 24 与 pnpm 11（仓库自身）；用户机器不需要装 Node / git —— 应用内置 Electron 自带的 Node 和离线 pnpm 仓库。

## 仓库结构

```
apps/studio/              Electron 桌面应用
  src/main/               主进程：站点/文章/画布 AST/预览/发布/体检/文件监听
  src/preload/            类型化 IPC 桥
  src/renderer/src/       Vue 界面：ui/（22 个自研组件）、views/、stores/
packages/core/            纯逻辑：AST 补丁、Markdown 保真写回、组件清单、SEO/slug、迁移器
packages/template/        站点模板（标准 Astro + 34 个 xiao 组件 + 6 套主题预设）
examples/demo/            演示站（由 core 的迁移器生成，CI 部署）
spikes/                   M0 技术验证（保留备查）
.agents/                  需求、决策、规格、验证、进度日志（续接工作的唯一入口）
```

## 文档

工程侧文档在 `.agents/`：

| 文件 | 内容 |
|---|---|
| [.agents/README.md](.agents/README.md) | 目录约定与续接方式 |
| [.agents/requirements.md](.agents/requirements.md) | 需求 R-xx、约束 C-xx、不做项 |
| [.agents/decisions.md](.agents/decisions.md) | 决策 D-xx |
| [.agents/specs/](.agents/specs/) | 权威规格：站点模板、组件、编辑、Studio、发布、界面重写、主题系统 |
| [.agents/log.md](.agents/log.md) | 进度日志（倒序） |
| [.agents/verification.md](.agents/verification.md) | 待验证/已验证清单 |

站点使用说明随模板分发：新建站点后看项目里的 `README` 与 `xiao.config.schema.json`。

## 常用命令（仓库根）

```bash
pnpm test                         # core 单元测试（vitest）
pnpm lint                         # ESLint（.vue 暂不参与）
pnpm format:check                 # Prettier
pnpm --filter studio build        # 构建 Studio
```

## 当前状态（2026-10-23）

- 界面与站点样式系统已重写：深色专业风、预览坞 + 独立预览窗、命令面板、6 套主题预设、组件属性面板、页面级样式。
- 发布链路已接通局域网 Gitea 并实测通过（空仓库首推 / 增量推送 / 冲突覆盖 / 默认分支自适应）。
- 尚未做：真机人工验收、模板升级路径、Gitea Pages / Actions 一键上线、安装包链路补全。
