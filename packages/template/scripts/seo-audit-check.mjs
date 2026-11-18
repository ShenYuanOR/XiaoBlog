import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditBuiltSite, displayWidth } from '../src/lib/seo-audit.mjs';

if (displayWidth('标题') !== 4) throw new Error('两个汉字的宽度应该是 4');
if (displayWidth('ab') !== 2) throw new Error('两个英文字母的宽度应该是 2');
if (displayWidth('汉a') !== 3) throw new Error('汉字和字母混排宽度不对');

const dir = mkdtempSync(path.join(tmpdir(), 'xiao-seo-'));
const longTitle = '标'.repeat(31);
const shortDesc = '摘'.repeat(29);
const pages = {
  'index.html': `<html lang="zh-CN"><head><title>${longTitle}</title><meta name="description" content="${shortDesc}"><link rel="canonical" href="https://example.com/"><meta property="og:title" content="${longTitle}"><meta property="og:description" content="${shortDesc}"></head><body><h1>一</h1><img src="/a.png"></body></html>`,
  'about/index.html': `<html lang="zh-CN"><head><title>${longTitle}</title><meta name="description" content="${shortDesc}"><link rel="canonical" href="https://example.com/about/"><meta property="og:title" content="${longTitle}"><meta property="og:description" content="${shortDesc}"><meta property="og:image" content="https://example.com/missing.png"></head><body><h1>关于</h1><h1>又一个</h1></body></html>`,
  'search/index.html': `<html lang="zh-CN"><head><title>搜索</title><meta name="description" content="${'搜'.repeat(40)}"><link rel="canonical" href="https://example.com/search/"><meta name="robots" content="noindex, nofollow"><meta property="og:title" content="搜索"><meta property="og:description" content="搜索"></head><body><h1>搜索</h1></body></html>`,
};
for (const [file, html] of Object.entries(pages)) {
  const full = path.join(dir, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, html);
}
const { issues } = auditBuiltSite(dir, { site: { url: 'https://example.com' } });
rmSync(dir, { recursive: true, force: true });

function has(rule) {
  return issues.some((issue) => issue.rule === rule);
}
if (!has('img-alt-missing')) throw new Error('没有查出缺 alt');
if (!has('title-duplicate')) throw new Error('没有查出重复标题');
if (!has('title-too-long')) throw new Error('31 个汉字的标题应该超长');
if (issues.some((issue) => issue.rule === 'title-too-long' && issue.detail.includes('宽度 60'))) {
  throw new Error('刚好 30 个汉字不该被当成超长');
}
if (!has('description-too-short')) throw new Error('29 个汉字的摘要应该过短');
if (!has('h1-count')) throw new Error('没有查出 h1 数量');
if (!has('og-image-missing-file')) throw new Error('没有查出缺失的 og:image 文件');
if (!has('noindex')) throw new Error('noindex 页面没有记成 info');
if (!has('site-url-placeholder')) throw new Error('example.com 没有被当成占位地址');
console.log('SEO_AUDIT_CHECKS_OK');
