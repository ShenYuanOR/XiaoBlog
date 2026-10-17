import MagicString from 'magic-string';
import { hasDiagnostics, parseSource } from './parse';
import {
  AstEditError,
  type AstroDoc,
  type EditableNode,
  type EditableProp,
  type PropValue,
} from './types';

export function hashSource(source: string): string {
  let hash = 5381;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function findNode(nodes: readonly EditableNode[], id: string): EditableNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
  return undefined;
}

function requireNode(doc: AstroDoc, id: string): EditableNode {
  const node = findNode(doc.tree, id);
  if (!node) throw new AstEditError(`找不到节点 ${id}`);
  return node;
}

function assertStructurallyEditable(node: EditableNode): void {
  if (node.kind === 'locked' || node.kind === 'text') {
    throw new AstEditError(`节点 ${node.id} 已锁定，不能改结构`);
  }
  if (!node.openTag) throw new AstEditError(`节点 ${node.id} 没有开标签`);
}

function renderValue(value: PropValue, existing: EditableProp | undefined): string {
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (typeof value === 'boolean') {
    if (value && existing?.value.kind === 'boolean-flag') return '';
    return `{${value ? 'true' : 'false'}}`;
  }
  if (typeof value === 'number') return `{${value}}`;
  return `{${JSON.stringify(value)}}`;
}

function attrInsertionPoint(source: string, openEnd: number): number {
  const tail = source.slice(Math.max(0, openEnd - 2), openEnd);
  if (tail.endsWith('/>')) return openEnd - 2;
  return openEnd - 1;
}

function applyEdits(source: string, edits: { start: number; end: number; text: string }[]): string {
  const magic = new MagicString(source);
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  for (const edit of ordered) {
    if (edit.start === edit.end) magic.appendLeft(edit.start, edit.text);
    else if (edit.text.length === 0) magic.remove(edit.start, edit.end);
    else magic.overwrite(edit.start, edit.end, edit.text);
  }
  const next = magic.toString();
  assertUntouched(source, next, ordered);
  const parsed = parseSource(next);
  if (hasDiagnostics(parsed.diagnostics)) {
    throw new AstEditError('补丁后的文件无法解析');
  }
  return next;
}

function assertUntouched(
  source: string,
  next: string,
  edits: { start: number; end: number; text: string }[],
): void {
  const ranges = [...edits].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let built = '';
  for (const range of ranges) {
    built += source.slice(cursor, range.start);
    built += range.text;
    cursor = range.end;
  }
  built += source.slice(cursor);
  if (built !== next) throw new AstEditError('未触碰区域发生了变化');
}

export function setProp(doc: AstroDoc, nodeId: string, name: string, value: PropValue): string {
  const node = requireNode(doc, nodeId);
  assertStructurallyEditable(node);
  const existing = node.props?.find((prop) => prop.name === name);
  if (existing?.value.kind === 'locked') throw new AstEditError(`属性 ${name} 已锁定`);
  const rendered = renderValue(value, existing);
  if (!existing) {
    const open = node.openTag;
    if (!open) throw new AstEditError(`节点 ${node.id} 没有开标签`);
    const at = attrInsertionPoint(doc.source, open.end);
    const text = rendered.length === 0 ? ` ${name}` : ` ${name}=${rendered}`;
    return applyEdits(doc.source, [{ start: at, end: at, text }]);
  }
  if (rendered.length === 0) return doc.source;
  if (existing.value.kind === 'boolean-flag') {
    return applyEdits(doc.source, [
      { start: existing.start, end: existing.end, text: `${name}=${rendered}` },
    ]);
  }
  const valueStart = doc.source.indexOf('=', existing.start) + 1;
  return applyEdits(doc.source, [{ start: valueStart, end: existing.end, text: rendered }]);
}

export function removeProp(doc: AstroDoc, nodeId: string, name: string): string {
  const node = requireNode(doc, nodeId);
  assertStructurallyEditable(node);
  const existing = node.props?.find((prop) => prop.name === name);
  if (!existing) throw new AstEditError(`没有属性 ${name}`);
  if (existing.value.kind === 'locked') throw new AstEditError(`属性 ${name} 已锁定`);
  let start = existing.start;
  while (start > 0 && (doc.source[start - 1] === ' ' || doc.source[start - 1] === '\t')) start -= 1;
  return applyEdits(doc.source, [{ start, end: existing.end, text: '' }]);
}

function depthOf(nodes: readonly EditableNode[], id: string, depth: number): number | undefined {
  for (const node of nodes) {
    if (node.id === id) return depth;
    const nested = depthOf(node.children, id, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function childIndent(doc: AstroDoc, parent: EditableNode): string {
  const depth = depthOf(doc.tree, parent.id, 0) ?? 0;
  return doc.indentUnit.repeat(depth + 1);
}

function insertAt(doc: AstroDoc, parent: EditableNode, index: number): number {
  if (!parent.openTag) throw new AstEditError(`节点 ${parent.id} 不能插入子节点`);
  if (index < 0 || index > parent.children.length) throw new AstEditError('插入位置超出范围');
  if (index === 0) return parent.openTag.end;
  const previous = parent.children[index - 1];
  if (!previous) throw new AstEditError('插入位置超出范围');
  return previous.end;
}

export function insertNode(
  doc: AstroDoc,
  parentId: string,
  index: number,
  snippet: string,
): string {
  const parent = requireNode(doc, parentId);
  assertStructurallyEditable(parent);
  assertCanNest(parent.name, snippet);
  const at = insertAt(doc, parent, index);
  const text = `${doc.eol}${childIndent(doc, parent)}${snippet.trim()}`;
  return applyEdits(doc.source, [...importEdits(doc, snippet), { start: at, end: at, text }]);
}

export function duplicateNode(doc: AstroDoc, nodeId: string): string {
  const node = requireNode(doc, nodeId);
  const slice = doc.source.slice(node.start, node.end).trim();
  const text = `${doc.eol}${doc.indentUnit}${slice}`;
  return applyEdits(doc.source, [{ start: node.end, end: node.end, text }]);
}

export function wrapNode(doc: AstroDoc, nodeId: string, wrapperSnippet: string): string {
  const node = requireNode(doc, nodeId);
  const name = wrapperSnippet.trim().match(/^<([A-Za-z][\w.]*)/)?.[1];
  if (!name) throw new AstEditError('包裹片段缺少标签名');
  assertCanNest(name, doc.source.slice(node.start, node.end));
  const inner = doc.source.slice(node.start, node.end).trim();
  const text = `${wrapperSnippet.trim()}${doc.eol}${doc.indentUnit}${inner}${doc.eol}</${name}>`;
  return applyEdits(doc.source, [
    ...importEdits(doc, wrapperSnippet),
    { start: node.start, end: node.end, text },
  ]);
}

function lineBounds(
  source: string,
  node: EditableNode,
): { start: number; end: number } | undefined {
  let start = node.start;
  while (start > 0 && source[start - 1] !== '\n') start -= 1;
  const end = node.end;
  const line = source.slice(start, end);
  if (line.replace(source.slice(node.start, node.end), '').trim().length > 0) return undefined;
  if (start > 0 && source[start - 1] === '\n') {
    const cut = source[start - 2] === '\r' ? 2 : 1;
    return { start: start - cut, end: node.end };
  }
  return { start, end };
}

const nestDeny: Record<string, readonly string[]> = {
  p: ['div', 'section', 'main', 'Card', 'Columns', 'Section'],
  span: ['div', 'section', 'p'],
  Text: ['Section', 'Columns', 'Card', 'div'],
};

export function assertCanNest(parentName: string | undefined, snippet: string): void {
  const child = snippet.trim().match(/^<([A-Za-z][\w.]*)/)?.[1];
  if (!parentName || !child) return;
  if ((nestDeny[parentName] ?? []).includes(child)) {
    throw new AstEditError(`${parentName} 不能包含 ${child}`);
  }
}

function escapeText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

export function setText(doc: AstroDoc, nodeId: string, text: string): string {
  const node = requireNode(doc, nodeId);
  if (node.kind !== 'text') throw new AstEditError('只能改纯文本节点');
  return applyEdits(doc.source, [{ start: node.start, end: node.end, text: escapeText(text) }]);
}

function componentNames(snippet: string): string[] {
  return [...snippet.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map((match) => match[1] ?? '');
}

function frontmatterEnd(source: string): number {
  if (!source.startsWith('---')) return 0;
  const close = source.indexOf('\n---', 3);
  if (close < 0) return 0;
  return close + 1;
}

function importEdits(
  doc: AstroDoc,
  snippet: string,
): { start: number; end: number; text: string }[] {
  const missing = componentNames(snippet).filter(
    (name, index, all) =>
      all.indexOf(name) === index && !doc.imports.some((item) => item.name === name),
  );
  if (missing.length === 0) return [];
  const at = frontmatterEnd(doc.source);
  const lines = missing
    .map((name) => `import ${name} from '../components/xiao/${name}.astro';`)
    .join(doc.eol);
  return [{ start: at, end: at, text: `${doc.eol}${lines}` }];
}

export function removeNode(doc: AstroDoc, nodeId: string): string {
  const node = requireNode(doc, nodeId);
  const line = lineBounds(doc.source, node);
  const start = line?.start ?? node.start;
  const end = line?.end ?? node.end;
  const edits = [{ start, end, text: '' }];
  if (node.name && node.name[0] === node.name[0]?.toUpperCase()) {
    const outside = doc.source.slice(0, node.start) + doc.source.slice(node.end);
    if (!outside.includes(`<${node.name}`)) {
      const imported = doc.imports.find((item) => item.name === node.name);
      if (imported) edits.push({ start: imported.start, end: imported.end, text: '' });
    }
  }
  return applyEdits(doc.source, edits);
}

export function moveNode(
  doc: AstroDoc,
  nodeId: string,
  newParentId: string,
  index: number,
): string {
  const node = requireNode(doc, nodeId);
  const parent = requireNode(doc, newParentId);
  assertStructurallyEditable(parent);
  assertCanNest(parent.name, doc.source.slice(node.start, node.end));
  if (parent.start >= node.start && parent.end <= node.end) {
    throw new AstEditError('不能把节点移到自己内部');
  }
  const at = insertAt(doc, parent, index);
  const slice = doc.source.slice(node.start, node.end);
  const removal = lineBounds(doc.source, node) ?? { start: node.start, end: node.end };
  if (at > removal.start && at < removal.end) throw new AstEditError('移动位置与节点重叠');
  const text = `${doc.eol}${childIndent(doc, parent)}${slice.trim()}`;
  return applyEdits(doc.source, [
    { start: removal.start, end: removal.end, text: '' },
    { start: at, end: at, text },
  ]);
}

export function assertDiskUnchanged(opened: string, disk: string): void {
  if (hashSource(opened) !== hashSource(disk)) {
    throw new AstEditError('文件在打开后被外部修改');
  }
}
