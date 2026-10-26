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

function isHtmlPostModule(id) {
  if (!id.includes('raw')) return false;
  const clean = (id.split('?')[0] ?? id).replaceAll('\\', '/');
  return /\/src\/content\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(clean);
}

/** 只改预览里读到的正文，不写回磁盘。标记偏移和画布节点 id 用的是同一段正文。 */
export function stampHtmlPost(source, relativePath, parse) {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text);
  if (!match) return source;
  const head = match[0];
  const body = text.slice(match[0].length);
  return `${head}${injectLoc(body, relativePath, parse)}`;
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
      if (!parse) return null;
      if (isHtmlPostModule(id)) {
        const clean = id.split('?')[0] ?? id;
        let source;
        try {
          source = readFileSync(clean, 'utf8');
        } catch {
          return null;
        }
        const relative = path.relative(root, clean).split(path.sep).join('/');
        const stamped = stampHtmlPost(source, relative, parse);
        return `export default ${JSON.stringify(stamped)}`;
      }
      if (!isAstroModule(id)) return null;
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
