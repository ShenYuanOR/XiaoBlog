import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { slugErrors } from './rules.mjs';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}

function routeOf(file, dist) {
  const rel = path.relative(dist, file).replaceAll('\\', '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'/index.html'.length)}`;
  return `/${rel.replace(/\.html$/, '')}`;
}

function siteBase() {
  try {
    const config = JSON.parse(readFileSync(path.join(process.cwd(), 'xiao.config.json'), 'utf8'));
    const base = typeof config.site?.base === 'string' ? config.site.base : '/';
    if (base === '/') return '';
    return base.endsWith('/') ? base.slice(0, -1) : base;
  } catch {
    return '';
  }
}

function normalizeHref(href, base) {
  let bare = decodeURIComponent(href.split('#')[0].split('?')[0]);
  if (base && (bare === base || bare.startsWith(`${base}/`))) bare = bare.slice(base.length) || '/';
  return bare.replace(/\/+$/, '') || '/';
}

export function checkBuiltSite(dist) {
  const files = walk(dist).filter((file) => !file.includes(`${path.sep}pagefind${path.sep}`));
  const known = new Set(files.map((file) => routeOf(file, dist)));
  const base = siteBase();
  const errors = [];
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const href = match[1];
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      const normalized = normalizeHref(href, base);
      if (/\.[a-z0-9]+$/i.test(normalized)) continue;
      if (!known.has(normalized)) errors.push(`${routeOf(file, dist)} -> ${href}`);
    }
  }
  return errors;
}

export function xiaoValidate() {
  return {
    name: 'xiao-validate',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const dist = dir.pathname
          ? decodeURIComponent(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'))
          : String(dir);
        const posts = path.join(process.cwd(), 'src', 'content', 'posts');
        let slugs = [];
        try {
          slugs = readdirSync(posts).filter((name) =>
            statSync(path.join(posts, name)).isDirectory(),
          );
        } catch {
          slugs = [];
        }
        const slugProblems = slugErrors(slugs);
        if (slugProblems.length > 0) {
          throw new Error(slugProblems.join('\n'));
        }
        const broken = checkBuiltSite(dist.replace(/\/$/, ''));
        if (broken.length > 0) {
          throw new Error(`站内死链：\n${broken.join('\n')}`);
        }
      },
    },
  };
}
