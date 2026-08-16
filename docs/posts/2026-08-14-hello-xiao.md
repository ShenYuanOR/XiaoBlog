---
title: 你好，晓
slug: hello-xiao
date: '2026-08-14 20:00:00'
description: 「晓」框架的第一篇样例文章，验证引擎的 SEO、校验与图片归位管线。
tags:
  - 随笔
category: 生活
updated: '2026-08-16 22:31:10'
---

这是「晓」框架的第一篇样例文章，用于验证：

1. SEO 自动生成（canonical / OG / JSON-LD / sitemap / RSS）
2. frontmatter 校验
3. 图片构建归位

## 图片归位测试

下面这张图片写在暂存区相对路径，构建时应自动归位到 `public/posts/hello-xiao/` 并以绝对路径输出：

![测试图片](/images/hello-xiao/2026-08-14-test-image.svg)

### 暂存区约定

正文使用相对路径引用 `_assets/<slug>/`，构建期自动归位。

### 输出路径

归位后 URL 形如 `/images/<slug>/文件名`。

## 内部链接测试

- [归档](/archives)
- [标签](/tags)
- [关于](/about)

### 站内路由

文章 URL 为 `/posts/<slug>`，与文件名日期前缀解耦。

## 目录与章节

滚动时侧栏目录应高亮当前章节，并支持多级展开/折叠。

### 二级标题 A

用于验证目录树与滚动定位。

#### 三级标题 A1

更深一层，确认折叠与高亮链路。

### 二级标题 B

另一个分支节点。
