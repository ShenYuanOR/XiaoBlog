# 迁移指南

从其他博客框架迁移到「晓」：适配器扫描源站 → 只读报告 → 确认后落盘。

## 支持来源

| 来源 | 结构 | 说明 |
|---|---|---|
| Valaxy 0.26 | `<root>/pages/posts/*.md` + `<root>/public/` | slug 由文件名转写；图片为站内绝对路径 `/posts/<目录>/x.png` |
| Hexo | `<root>/source/_posts/*.md` | slug 由文件名派生（需人工确认 URL）；图片支持同目录相对引用与 `/images/` |

## 用法

```bash
# 1. 只读扫描，输出迁移报告（不写任何文件）
pnpm migrate --from valaxy --source /path/to/valaxy-site --site-url https://old-site.com

# 2. 确认报告后落盘（文章 + 图片 + redirects.yml；落盘前再次确认，--yes 跳过）
pnpm migrate --from valaxy --source /path/to/valaxy-site --site-url https://old-site.com --apply
```

参数：

| 参数 | 说明 |
|---|---|
| `--from` | 来源框架：`valaxy` / `hexo` |
| `--source` | 源站根目录（绝对或相对路径） |
| `--site-url` | 旧站域名，用于生成旧 URL 与 301 登记 |
| `--keep-date-slug` | 保留源文件名（含日期前缀）作 slug：旧 URL 不变、零重定向 |
| `--apply` | 落盘（默认仅报告） |
| `--yes` | 跳过落盘前确认 |

## 报告内容

每篇文章显示：日期、目标 slug、标题、缺字段标记、图片数量（存在/引用）。

问题清单包括：slug 冲突、slug 不合法、缺失图片引用。

## 落盘行为

- 文章 → `docs/posts/YYYY-MM-DD-<slug>.md`（frontmatter 补齐：slug/date/tags/category/layout；description 缺失时从正文提取前 120 字符作为初稿，可手动精修）
- 图片 → 复制到 `docs/posts/_assets/<slug>/`，正文引用改写为 `./_assets/<slug>/<文件名>`（构建时自动归位）
- `redirects.yml` → 默认纯净 slug 模式下，旧 URL 与新 slug 不一致时自动登记 301（幂等，不重复追加）
- 目标文件已存在则跳过（可安全重复执行）

## slug 策略

- **默认（推荐）**：纯净 slug（去日期前缀，中文转拼音）→ 旧 URL 通过 301 显式映射（符合 SEO 迁移原则）
- **`--keep-date-slug`**：保留带日期前缀 slug → 旧 URL 完全不变，零重定向（适合对旧站 SEO 连续性要求最高、或旧 URL 已被广泛引用的场景）

slug 由文件名派生，中文经拼音转写；建议落盘前核对报告，必要时落盘后手动修改 frontmatter 的 slug 并确认 redirects.yml。

## 迁移后检查

```bash
pnpm dev        # 预览迁移的文章与图片
pnpm build      # 校验门禁：slug/字段/死链/图片/重定向目标
pnpm gen:redirects   # 确认 redirects.yml → _redirects / nginx 规则
```

上线前：核对 sitemap 与旧站 URL 的 301 生效情况（旧站下线前可在新站验证 `_redirects` 规则）。

## 新增适配器

实现约定：

1. `engine/importer/<name>.ts`：导出 `scan(source)`，读取源站 → `MigratedPost[]`（types.ts）
2. 报告问题写进 `post.issues`（缺字段/图片缺失等）
3. `scan()` 与 `apply()` 在 `engine/importer/index.ts` 注册分发
4. `scripts/migrate.mjs` 加入 `--from <name>` 与路径约定
