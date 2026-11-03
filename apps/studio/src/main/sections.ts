/**
 * 「存为区块」：把页面里选中的一段结构复制成站点内的普通 Astro 组件。
 *
 * 产物是 src/components/xiao/<Name>.astro，带一行 `xiao-section:` 标记；
 * 不建私有索引，列表和引用次数都靠扫描站点文件得到。
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { findNode, parseAstro } from '@xiao/core/ast';
import { normalizePageFile } from '@xiao/core/site';
import { safePage } from './canvas.ts';

interface AstNodeLike {
  kind: string;
  name?: string;
  start: number;
  end: number;
  children?: AstNodeLike[];
}

export interface SavedSection {
  name: string;
  label: string;
  file: string;
  refs: number;
}

const SECTION_MARK = /<!--\s*xiao-section:\s*([^>]*?)\s*-->/;
const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/;

function walkFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(full, out);
    else if (name.endsWith('.astro')) out.push(full);
  }
}

function hasLocked(node: AstNodeLike): boolean {
  if (node.kind === 'locked') return true;
  if (node.kind !== 'text' && node.name === 'slot') return true;
  return (node.children ?? []).some((child) => hasLocked(child));
}

function pascal(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9一-龥]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const ascii = words
    .map((word) => (/^[A-Za-z]/.test(word) ? word : ''))
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join('');
  if (ascii) return ascii.slice(0, 40);
  const stamp = Date.now().toString(36);
  return `SavedSection${stamp.slice(-4).toUpperCase()}`;
}

function importLine(source: string, name: string, targetRel: string): string {
  const statement = source.match(new RegExp(`import\\s+${name}\\s+from\\s+['"][^'"]+['"];?`));
  if (!statement) return '';
  return `import ${name} from '${targetRel}';`;
}

export function saveSection(
  siteDir: string,
  file: string,
  nodeId: string,
  label: string,
): SavedSection {
  const normalized = normalizePageFile(safePage(file));
  if (!normalized.endsWith('.astro')) throw new Error('只能从 Astro 页面/版式里存区块');
  const full = path.join(siteDir, normalized);
  const source = readFileSync(full, 'utf8');
  const doc = parseAstro(source);
  const node = findNode(doc.tree as AstNodeLike[], nodeId);
  if (!node) throw new Error('选中的节点对不上源码');
  if (hasLocked(node)) {
    throw new Error('这块包含表达式或正文插槽，先改成静态结构再存为区块');
  }
  const snippet = source.slice(node.start, node.end).trim();
  if (!snippet) throw new Error('选中的内容为空');

  const tags = new Set<string>();
  for (const match of snippet.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
    if (match[1]) tags.add(match[1]);
  }
  const imports: string[] = [];
  const xiaoDir = path.posix.join('src', 'components', 'xiao');
  for (const tag of tags) {
    const found = doc.imports.find((item) => item.name === tag);
    if (!found) continue;
    const raw = source.slice(found.start, found.end);
    const from = /from\s+['"]([^'"]+)['"]/.exec(raw)?.[1];
    if (!from) continue;
    const target = from.startsWith('/')
      ? from.slice(1)
      : path.posix.normalize(path.posix.join(path.posix.dirname(normalized), from));
    const rel = path.posix.relative(xiaoDir, target);
    imports.push(importLine(source, tag, rel.startsWith('.') ? rel : `./${rel}`));
  }

  const baseName = pascal(label || node.name || 'Section');
  let name = baseName;
  let index = 2;
  while (existsSync(path.join(siteDir, xiaoDir, `${name}.astro`))) {
    name = `${baseName}${index}`;
    index += 1;
  }
  const safeLabel = (label || node.name || '我的区块').replace(/-->/g, '→');
  const body = [
    '---',
    '// 由 Studio「存为区块」生成；可以继续手改，改完仍是普通 Astro 组件。',
    ...imports.filter(Boolean),
    '---',
    '',
    `<!-- xiao-section: ${safeLabel} -->`,
    snippet,
    '',
  ].join('\n');
  writeFileSync(path.join(siteDir, xiaoDir, `${name}.astro`), body);
  return {
    name,
    label: safeLabel,
    file: `${xiaoDir}/${name}.astro`,
    refs: 0,
  };
}

export function usageCounts(siteDir: string, names: string[]): Record<string, number> {
  const wanted = [...new Set(names)].filter((name) => COMPONENT_NAME.test(name));
  const files: string[] = [];
  walkFiles(path.join(siteDir, 'src', 'pages'), files);
  walkFiles(path.join(siteDir, 'src', 'layouts'), files);
  const counts: Record<string, number> = {};
  for (const name of wanted) {
    const pattern = new RegExp(`<${name}(?![A-Za-z0-9])`);
    counts[name] = files.filter((full) => pattern.test(readFileSync(full, 'utf8'))).length;
  }
  return counts;
}

export function listSections(siteDir: string): SavedSection[] {
  const xiaoDir = path.join(siteDir, 'src', 'components', 'xiao');
  if (!existsSync(xiaoDir)) return [];
  const sectionFiles = readdirSync(xiaoDir)
    .filter((name) => name.endsWith('.astro'))
    .map((name) => path.join(xiaoDir, name))
    .filter((full) => SECTION_MARK.test(readFileSync(full, 'utf8')));
  if (!sectionFiles.length) return [];

  const users: string[] = [];
  walkFiles(path.join(siteDir, 'src', 'pages'), users);
  walkFiles(path.join(siteDir, 'src', 'layouts'), users);
  const texts = users.map((full) => ({ file: full, text: readFileSync(full, 'utf8') }));

  return sectionFiles
    .map((full) => {
      const name = path.basename(full, '.astro');
      const source = readFileSync(full, 'utf8');
      const label = SECTION_MARK.exec(source)?.[1]?.trim() || name;
      const pattern = new RegExp(`<${name}(?![A-Za-z0-9])`);
      const refs = texts.filter((item) => pattern.test(item.text)).length;
      return {
        name,
        label,
        file: `src/components/xiao/${name}.astro`,
        refs,
      };
    })
    .filter((item) => COMPONENT_NAME.test(item.name))
    .sort((left, right) => right.refs - left.refs || left.label.localeCompare(right.label));
}
