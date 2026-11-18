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

const merged = mkdtempSync(path.join(tmpdir(), 'xiao-seo-merge-'));
const ownShort = '专'.repeat(10);
const mergedPages = {
  'index.html': `<html lang="zh-CN"><head><title>首页</title><meta name="description" content="${shortDesc}"><link rel="canonical" href="https://example.com/"><meta property="og:title" content="首页"><meta property="og:description" content="${shortDesc}"><meta property="og:image" content="https://example.com/missing.png"></head><body><h1>首页</h1></body></html>`,
  'about/index.html': `<html lang="zh-CN"><head><title>关于</title><meta name="description" content="${shortDesc}"><link rel="canonical" href="https://example.com/about/"><meta property="og:title" content="关于"><meta property="og:description" content="${shortDesc}"><meta property="og:image" content="https://example.com/missing.png"></head><body><h1>关于</h1></body></html>`,
  'posts/mine/index.html': `<html lang="zh-CN"><head><title>自己的摘要</title><meta name="description" content="${ownShort}"><link rel="canonical" href="https://example.com/posts/mine/"><meta property="og:title" content="自己的摘要"><meta property="og:description" content="${ownShort}"></head><body><h1>文章</h1></body></html>`,
  '404.html': `<html><head><title>404</title><meta name="description" content="${ownShort}"><meta name="robots" content="noindex"><meta property="og:title" content=""></head><body></body></html>`,
  'search/index.html': `<html lang="zh-CN"><head><title>搜索</title><meta name="description" content="${shortDesc}"><meta name="robots" content="noindex, nofollow"></head><body><h1>搜索</h1><h1>又一个</h1></body></html>`,
  '2026-08-14-hello-xiao/index.html': `<!doctype html><title>Redirecting to: /posts/hello/</title><meta http-equiv="refresh" content="0;url=/posts/hello/"><meta name="robots" content="noindex"><link rel="canonical" href="https://example.com/posts/hello/"><body><a href="/posts/hello/">Redirecting</a></body>`,
};
for (const [file, html] of Object.entries(mergedPages)) {
  const full = path.join(merged, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, html);
}
const mergedResult = auditBuiltSite(merged, {
  site: { url: 'https://example.com', description: shortDesc, ogImage: '/missing.png' },
});
rmSync(merged, { recursive: true, force: true });

function ofRoute(route) {
  return mergedResult.issues.filter((issue) => issue.route === route);
}
const redirectIssues = ofRoute('/2026-08-14-hello-xiao');
if (redirectIssues.length !== 0) throw new Error(`跳转页不该有条目：${redirectIssues.map((issue) => issue.rule).join(',')}`);
for (const route of ['/404', '/search']) {
  const rows = ofRoute(route);
  if (rows.length !== 1 || rows[0].rule !== 'noindex') {
    throw new Error(`${route} 只该有 noindex，实际 ${rows.map((issue) => issue.rule).join(',') || '空'}`);
  }
}
const siteShort = mergedResult.issues.filter(
  (issue) => issue.rule === 'description-too-short' && issue.detail.startsWith('站点简介太短'),
);
if (siteShort.length !== 1) throw new Error(`站点简介太短应该只有一条，实际 ${siteShort.length}`);
if (!siteShort[0].detail.includes('2 个页面')) throw new Error(`站点简介没有写上使用它的页面数：${siteShort[0].detail}`);
if (siteShort[0].fix?.field !== 'description') throw new Error('站点简介的修复入口应该是设置里的简介');
const own = mergedResult.issues.filter(
  (issue) => issue.rule === 'description-too-short' && issue.route === '/posts/mine',
);
if (own.length !== 1) throw new Error('文章自己的短摘要应该单独报');
const dup = mergedResult.issues.filter((issue) => issue.rule === 'description-duplicate');
if (dup.length !== 0) throw new Error('跟站点简介相同的摘要不该再拆成重复条目');
const missingOg = mergedResult.issues.filter((issue) => issue.rule === 'og-image-missing-file');
if (missingOg.length !== 1) throw new Error(`缺失的默认分享图应该合并成一条，实际 ${missingOg.length}`);
if (missingOg[0].fix?.field !== 'ogImage') throw new Error('默认分享图的修复入口应该是设置里的分享图');
if (!missingOg[0].detail.includes('2 个页面')) throw new Error(`默认分享图没有写上页面数：${missingOg[0].detail}`);

const emptyOg = mkdtempSync(path.join(tmpdir(), 'xiao-seo-og-'));
writeFileSync(path.join(emptyOg, 'cover.png'), 'png');
const emptyPages = {
  'index.html': `<html lang="zh-CN"><head><title>首页</title><meta name="description" content="${'摘'.repeat(40)}"><link rel="canonical" href="https://example.com/"><meta property="og:title" content="首页"><meta property="og:description" content="${'摘'.repeat(40)}"></head><body><h1>首页</h1></body></html>`,
  'about/index.html': `<html lang="zh-CN"><head><title>关于</title><meta name="description" content="${'摘'.repeat(40)}"><link rel="canonical" href="https://example.com/about/"><meta property="og:title" content="关于"><meta property="og:description" content="${'摘'.repeat(40)}"></head><body><h1>关于</h1></body></html>`,
  'posts/covered/index.html': `<html lang="zh-CN"><head><title>有封面</title><meta name="description" content="${'摘'.repeat(40)}"><link rel="canonical" href="https://example.com/posts/covered/"><meta property="og:title" content="有封面"><meta property="og:description" content="${'摘'.repeat(40)}"><meta property="og:image" content="https://example.com/cover.png"></head><body><h1>有封面</h1></body></html>`,
};
for (const [file, html] of Object.entries(emptyPages)) {
  const full = path.join(emptyOg, file);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, html);
}
const emptyResult = auditBuiltSite(emptyOg, { site: { url: 'https://example.com', ogImage: '' } });
rmSync(emptyOg, { recursive: true, force: true });
const emptyMissing = emptyResult.issues.filter((issue) => issue.rule === 'og-image-missing');
if (emptyMissing.length !== 1) {
  throw new Error(`没设默认分享图应该合并成一条，实际 ${emptyMissing.map((issue) => issue.detail).join(' | ')}`);
}
if (!emptyMissing[0].detail.includes('没有设置默认分享图') || !emptyMissing[0].detail.includes('2 个页面')) {
  throw new Error(`默认分享图文案不对：${emptyMissing[0].detail}`);
}
if (emptyMissing[0].fix?.field !== 'ogImage') throw new Error('没设默认分享图应该去设置页聚焦分享图');
const covered = emptyResult.issues.filter(
  (issue) => issue.route === '/posts/covered' && issue.rule.startsWith('og-image'),
);
if (covered.length !== 0) throw new Error(`有封面的文章不该被算进缺少分享图：${covered.map((issue) => issue.rule).join(',')}`);
console.log('SEO_AUDIT_CHECKS_OK');
