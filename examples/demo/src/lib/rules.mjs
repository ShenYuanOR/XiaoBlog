export function configFieldErrors(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return ['(root)'];
  if (typeof config.version !== 'number') errors.push('version');
  const site = config.site;
  if (!site || typeof site !== 'object') errors.push('site');
  else {
    for (const key of ['url', 'base', 'lang', 'title', 'description']) {
      if (typeof site[key] !== 'string' || site[key].trim() === '') errors.push(`site.${key}`);
    }
  }
  if (typeof config.theme?.hue !== 'number' || config.theme.hue < 0 || config.theme.hue > 360) {
    errors.push('theme.hue');
  }
  return errors;
}

export function deadLinks(html, known) {
  const dead = [];
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const path = href.split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';
    if (!known.has(path)) dead.push(href);
  }
  return dead;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugErrors(slugs) {
  const errors = [];
  const seen = new Map();
  for (const slug of slugs) {
    if (!SLUG_RE.test(slug)) errors.push(`slug 不合法：${slug}`);
    seen.set(slug, (seen.get(slug) ?? 0) + 1);
  }
  for (const [slug, count] of seen) {
    if (count > 1) errors.push(`slug 重复：${slug}`);
  }
  return errors;
}
