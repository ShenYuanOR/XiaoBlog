#!/usr/bin/env node
/**
 * 晓 · 重定向生成：pnpm gen:redirects
 * 读取 redirects/redirects.yml（URL 迁移唯一事实来源），生成：
 *   - public/_redirects（GitHub Pages / Netlify 通用格式，随构建进入 dist）
 *   - redirects/redirects.nginx.conf（Nginx 规则片段）
 * 构建时会自动执行（config.ts buildStart），此命令用于手动生成/检查。
 */
import { loadRedirects, validateRedirects, syncRedirectFiles } from '../.vitepress/engine/redirects.ts'

const redirects = loadRedirects()
const issues = validateRedirects(redirects)
if (issues.length > 0) {
  console.error(`redirects 校验失败:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
  process.exit(1)
}

const result = syncRedirectFiles()
console.log(`[gen-redirects] ${result.count} 条规则 → public/_redirects + redirects/redirects.nginx.conf`)
