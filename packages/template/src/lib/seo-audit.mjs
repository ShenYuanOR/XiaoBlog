import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { checkBuiltSite } from './links.mjs';

/**
 * 显示宽度：汉字和全角算 2，其余算 1。
 * Studio 的 apps/studio/src/main/seo.ts 有一份同步副本，改规则时两处一起改。
 */
export function displayWidth(text) {
  let width = 0;
  for (const char of String(text ?? '')) {
    const code = char.codePointAt(0) ?? 0;
    width += isWide(code) ? 2 : 1;
  }
  return width;
}

function isWide(code) {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function routeOf(file, dist) {
  const rel = path.relative(dist, file).replaceAll('\\', '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'/index.html'.length)}`;
  return `/${rel.replace(/\.html$/, '')}`;
}

function decodeText(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim();
}

function meta(html, key, attr) {
  const pattern = new RegExp(
    `<meta\\b[^>]*\\b${attr}=["']${key}["'][^>]*\\bcontent=["']([^"']*)["']|<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\b${attr}=["']${key}["']`,
    'i',
  );
  const match = pattern.exec(html);
  return decodeText(match?.[1] || match?.[2] || '');
}

function postFix(route, field) {
  const match = /\/posts\/([^/]+)/.exec(route);
  if (!match) return undefined;
  return { kind: 'post', slug: decodeURIComponent(match[1]), field };
}

function placeholderUrl(siteUrl) {
  try {
    const host = new URL(siteUrl).hostname.toLowerCase();
    return host === 'example.com' || host.endsWith('.example.com') || host === 'example.org' || host === 'localhost';
  } catch {
    return true;
  }
}

/**
 * 读构建产物。返回 issues 和每页抽取出的真实标签。
 * @param {string} dist
 * @param {{ site?: { url?: string } }} config
 */
export function auditBuiltSite(dist, config = {}) {
  const siteUrl = (config.site?.url || '').trim();
  const files = walk(dist).filter(
    (file) => file.endsWith('.html') && !file.includes(`${path.sep}pagefind${path.sep}`),
  );
  const pages = [];
  const issues = [];
  if (placeholderUrl(siteUrl)) {
    issues.push({
      level: 'error',
      rule: 'site-url-placeholder',
      route: '/',
      detail: `站点地址还是占位值：${siteUrl || '（空）'}`,
      fix: { kind: 'settings', field: 'url' },
    });
  }
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    const route = routeOf(file, dist);
    const title = decodeText(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '');
    const description = meta(html, 'description', 'name');
    const canonical = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i)?.[1] ?? '';
    const ogTitle = meta(html, 'og:title', 'property');
    const ogDescription = meta(html, 'og:description', 'property');
    const ogImage = meta(html, 'og:image', 'property');
    const robots = meta(html, 'robots', 'name');
    const htmlOpen = html.match(/<html\b[\s\S]*?>/i)?.[0] ?? '';
    const lang = htmlOpen.match(/\slang=["']([^"']*)["']/i)?.[1]?.trim() ?? '';
    const noindex = /noindex/i.test(robots);
    const h1 = html.match(/<h1\b/gi)?.length ?? 0;
    pages.push({ route, title, description, canonical, ogImage });
    if (noindex) {
      issues.push({
        level: 'info',
        rule: 'noindex',
        route,
        detail: '这个页面标记了 noindex，不会被搜索引擎收录',
      });
    }
    if (!lang) {
      issues.push({ level: 'error', rule: 'html-lang-missing', route, detail: '<html> 没有 lang' });
    }
    if (!title) {
      issues.push({
        level: 'error',
        rule: 'title-missing',
        route,
        detail: '页面没有 <title>',
        fix: postFix(route, 'title'),
      });
    } else if (displayWidth(title) > 60) {
      issues.push({
        level: 'warn',
        rule: 'title-too-long',
        route,
        detail: `标题显示宽度 ${displayWidth(title)}，超过 60（大约 30 个汉字）`,
        fix: postFix(route, 'title'),
      });
    }
    if (!description) {
      issues.push({
        level: 'error',
        rule: 'description-missing',
        route,
        detail: '页面没有 description',
        fix: postFix(route, 'description'),
      });
    } else {
      const width = displayWidth(description);
      if (width < 60 || width > 160) {
        issues.push({
          level: 'warn',
          rule: width < 60 ? 'description-too-short' : 'description-too-long',
          route,
          detail: `摘要显示宽度 ${width}，建议在 60 到 160 之间（大约 30 到 80 个汉字）`,
          fix: postFix(route, 'description'),
        });
      }
    }
    if (!canonical) {
      issues.push({ level: 'error', rule: 'canonical-missing', route, detail: '页面没有 canonical' });
    } else if (!/^https?:\/\//i.test(canonical) || (siteUrl && !canonical.startsWith(siteUrl))) {
      issues.push({
        level: 'error',
        rule: 'canonical-invalid',
        route,
        detail: `canonical 不是以站点地址开头的绝对地址：${canonical}`,
      });
    }
    if (!ogTitle) {
      issues.push({ level: 'warn', rule: 'og-title-missing', route, detail: '缺少 og:title' });
    }
    if (!ogDescription) {
      issues.push({ level: 'warn', rule: 'og-description-missing', route, detail: '缺少 og:description' });
    }
    if (!ogImage) {
      issues.push({
        level: 'warn',
        rule: 'og-image-missing',
        route,
        detail: '缺少 og:image',
        fix: postFix(route, 'cover') ?? { kind: 'settings', field: 'ogImage' },
      });
    } else if (siteUrl && ogImage.startsWith(siteUrl)) {
      const relative = decodeURIComponent(new URL(ogImage).pathname).replace(/^\/+/, '');
      if (relative && !existsSync(path.join(dist, relative))) {
        issues.push({
          level: 'error',
          rule: 'og-image-missing-file',
          route,
          detail: `og:image 指向的文件不在构建产物里：${relative}`,
          fix: postFix(route, 'cover') ?? { kind: 'settings', field: 'ogImage' },
        });
      }
    }
    if (h1 !== 1) {
      issues.push({
        level: 'warn',
        rule: 'h1-count',
        route,
        detail: `页面有 ${h1} 个 h1，应该恰好 1 个`,
      });
    }
    const images = html.match(/<img\b[^>]*>/gi) ?? [];
    const missingAlt = images.filter((tag) => !/\salt\s*=/i.test(tag)).length;
    if (missingAlt > 0) {
      issues.push({
        level: 'warn',
        rule: 'img-alt-missing',
        route,
        detail: `${missingAlt} 张图片没有 alt`,
      });
    }
  }
  const indexable = pages.filter((page) => {
    const file = files.find((item) => routeOf(item, dist) === page.route);
    if (!file) return true;
    return !/noindex/i.test(meta(readFileSync(file, 'utf8'), 'robots', 'name'));
  });
  const titleCounts = new Map();
  const descriptionCounts = new Map();
  for (const page of indexable) {
    if (page.title) titleCounts.set(page.title, (titleCounts.get(page.title) ?? 0) + 1);
    if (page.description) {
      descriptionCounts.set(page.description, (descriptionCounts.get(page.description) ?? 0) + 1);
    }
  }
  for (const page of indexable) {
    if (page.title && (titleCounts.get(page.title) ?? 0) > 1) {
      issues.push({
        level: 'warn',
        rule: 'title-duplicate',
        route: page.route,
        detail: `标题与其他页面重复：${page.title}`,
        fix: postFix(page.route, 'title'),
      });
    }
    if (page.description && (descriptionCounts.get(page.description) ?? 0) > 1) {
      issues.push({
        level: 'warn',
        rule: 'description-duplicate',
        route: page.route,
        detail: '摘要与其他页面重复',
        fix: postFix(page.route, 'description'),
      });
    }
  }
  for (const item of checkBuiltSite(dist)) {
    const splitAt = item.indexOf(' -> ');
    const route = splitAt >= 0 ? item.slice(0, splitAt) : '/';
    const href = splitAt >= 0 ? item.slice(splitAt + 4) : item;
    issues.push({
      level: 'error',
      rule: 'dead-link',
      route,
      detail: `站内链接没有对应页面：${href}`,
    });
  }
  for (const file of walk(dist)) {
    if (!/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file)) continue;
    const size = statSync(file).size;
    if (size > 2 * 1024 * 1024) {
      issues.push({
        level: 'warn',
        rule: 'image-too-large',
        route: `/${path.relative(dist, file).replaceAll('\\', '/')}`,
        detail: `图片 ${path.basename(file)} 超过 2 MB（${Math.round(size / 1024)} KB）`,
      });
    }
  }
  return { issues, pages };
}
