import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function walk(value, found) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found);
    return;
  }
  if (
    value.type === 'JSXElement' &&
    value.openingElement?.name &&
    typeof value.start === 'number'
  ) {
    found.push(value);
  }
  for (const child of Object.values(value)) walk(child, found);
}

export function injectLoc(source, relativePath, parse) {
  const parsed = parse(source);
  if ((parsed.diagnostics?.length ?? 0) > 0 || !parsed.ast?.body) return source;
  const elements = [];
  walk(parsed.ast.body, elements);
  const inserts = [];
  const seen = new Set();
  for (const element of elements) {
    const nameEnd = element.openingElement?.name?.end;
    const start = element.start;
    if (nameEnd === undefined || start === undefined || seen.has(nameEnd)) continue;
    const openEnd = element.openingElement?.end ?? nameEnd;
    const openTag = source.slice(start, openEnd);
    if (openTag.includes('data-xiao-loc') || openTag.includes('{...')) continue;
    seen.add(nameEnd);
    inserts.push({ at: nameEnd, text: ` data-xiao-loc="${relativePath}:${start}"` });
  }
  inserts.sort((left, right) => right.at - left.at);
  let next = source;
  for (const insert of inserts) {
    next = `${next.slice(0, insert.at)}${insert.text}${next.slice(insert.at)}`;
  }
  return next;
}

function isAstroModule(id) {
  const clean = id.split('?')[0] ?? id;
  if (!clean.endsWith('.astro') || id.includes('?')) return false;
  return !clean.replaceAll('\\', '/').includes('/node_modules/');
}

export function xiaoLocPlugin(siteDir) {
  let parse;
  let root = siteDir;
  return {
    name: 'xiao-loc',
    apply: 'serve',
    enforce: 'pre',
    async configResolved(config) {
      root = config.root || siteDir;
      const astroPkg = realpathSync(path.join(siteDir, 'node_modules', 'astro', 'package.json'));
      const require = createRequire(astroPkg);
      const id = require.resolve('@astrojs/compiler-rs');
      parse = (await import(pathToFileURL(id).href)).parse;
    },
    load(id) {
      if (!parse || !isAstroModule(id)) return null;
      const clean = id.split('?')[0] ?? id;
      let source;
      try {
        source = readFileSync(clean, 'utf8');
      } catch {
        return null;
      }
      const relative = path.relative(root, clean).split(path.sep).join('/');
      const next = injectLoc(source, relative, parse);
      return next === source ? null : next;
    },
  };
}
