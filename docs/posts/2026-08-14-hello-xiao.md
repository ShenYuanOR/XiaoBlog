---
title: 你好，晓
slug: hello-xiao
date: '2026-08-14 20:00:00'
description: 「晓」框架的第一篇样例文章，验证引擎的 SEO、校验与图片归位管线。
tags:
  - 随笔
category: 生活
updated: '2026-08-15 16:35:10'
---

这是「晓」框架的第一篇样例文章，用于验证：

1. SEO 自动生成（canonical / OG / JSON-LD / sitemap / RSS）
2. frontmatter 校验
3. 图片构建归位

## 图片归位测试

下面这张图片写在暂存区相对路径，构建时应自动归位到 `public/posts/hello-xiao/` 并以绝对路径输出：

![测试图片](/images/hello-xiao/2026-08-14-test-image.svg)

## 内部链接测试

- [归档](/archives)
- [标签](/tags)
- [关于](/about)
