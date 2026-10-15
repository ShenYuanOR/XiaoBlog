import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  extractDescription,
  isValidSlug,
  slugFromFile,
  slugFromTitle,
  toPinyinSlug,
} from '../site/slug.ts';
import type { MigratedImage } from './types.ts';

export { extractDescription, isValidSlug, slugFromFile, slugFromTitle, toPinyinSlug };

export const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/;

export function toWallClock(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  if (typeof value === 'string') {
    const matched = value.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
    if (matched) return matched[2] ? `${matched[1]} ${matched[2]}` : `${matched[1]} 00:00:00`;
  }
  return '';
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function coerce(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  return value;
}

/** 只解析迁移会碰到的 YAML：标量、布尔，以及一层列表。时间保持字符串。 */
export function parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const matched = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!matched) return { data: {}, content: raw };
  const data: Record<string, unknown> = {};
  const lines = matched[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const listKey = line.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (listKey) {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1] ?? '')) {
        i += 1;
        items.push(unquote((lines[i] ?? '').replace(/^\s+-\s+/, '')));
      }
      data[listKey[1]] = items;
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    data[pair[1]] = coerce(unquote(pair[2]));
  }
  return { data, content: raw.slice(matched[0].length) };
}

export function imageRefs(content: string): string[] {
  const refs: string[] = [];
  for (const matched of content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = (matched[1] ?? '').trim();
    if (/^(https?:)?\/\//.test(href)) continue;
    refs.push(href.split('#')[0]?.split('?')[0] ?? href);
  }
  return refs;
}

export function resolveImages(
  refs: string[],
  mdPath: string,
  publicDir: string | undefined,
  assetsDir?: string,
): MigratedImage[] {
  const images: MigratedImage[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const destName = (ref.split('/').pop() ?? ref).replace(/[^\w.-]/g, '_');
    let src = '';
    if (ref.startsWith('/')) {
      if (publicDir) src = join(publicDir, ref.replace(/^\//, ''));
      if ((!src || !existsSync(src)) && assetsDir) {
        const parts = ref.split('/').filter(Boolean);
        const slug = parts.length >= 2 ? parts[parts.length - 2] : '';
        const staged = join(assetsDir, slug ?? '', destName);
        if (existsSync(staged)) src = staged;
      }
    } else {
      src = join(dirname(mdPath), ref);
    }
    images.push({ ref, src, exists: src !== '' && existsSync(src), destName });
  }
  return images;
}

export function inferCodeLang(code: string): string | null {
  const sample = code.trim();
  if (!sample) return null;
  if (/^[{[]/.test(sample) && /"[^"]+"\s*:/.test(sample) && /[}\]]\s*$/.test(sample)) return 'json';
  if (/<\/?[a-z][^>]*>/i.test(sample) && /<\/[a-z]+>/i.test(sample)) return 'html';
  if (
    sample.includes('{') &&
    sample.includes('}') &&
    /^[.#\w][\w\s,.#>]*\{/m.test(sample) &&
    /[a-z-]+\s*:\s*[^;{}]+;/i.test(sample)
  ) {
    return 'css';
  }
  if (
    /^(npm|pnpm|yarn|npx|git|cd |sudo|apt|pip|node |docker|bash|sh |curl|wget|chmod|mkdir|cp |mv |rm |echo |set |export |cls|dir |md |powershell|taskkill)/im.test(
      sample,
    )
  ) {
    return 'bash';
  }
  if (/\b(var|let|const|function|return|typeof|new)\b/.test(sample) && /[;{}]/.test(sample)) {
    return 'javascript';
  }
  return null;
}

/** 给没有语言标记的围栏补一个推断语言。认不出就保持原样。 */
export function annotateCodeBlocks(content: string): { content: string; annotated: number } {
  let annotated = 0;
  const next = content.replace(/```[ \t]*\n([\s\S]*?)```/g, (whole, body: string) => {
    const lang = inferCodeLang(body);
    if (!lang) return whole;
    annotated += 1;
    return `\`\`\`${lang}\n${body}\`\`\``;
  });
  return { content: next, annotated };
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

export function asText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
