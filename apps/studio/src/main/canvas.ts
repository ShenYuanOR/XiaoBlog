import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertCanNest,
  duplicateNode,
  findNode,
  insertNode,
  moveNode,
  parseAstro,
  removeNode,
  recordEdit,
  redoEdit,
  setProp,
  setText,
  undoEdit,
  wrapNode,
  type FileHistory,
} from '@xiao/core/ast';
import { htmlNodeComponent, htmlSnippet, manifest } from '@xiao/core/components';
import { isHtmlPostFile, isSharedLayout, isSitePart, normalizePageFile } from '@xiao/core/site';

export interface OutlineNode {
  id: string;
  name: string;
  kind: string;
  locked: boolean;
  text: string;
  props: { name: string; value: string }[];
  children: OutlineNode[];
}

/** 页面文件：src/pages/** 下的 .astro，路径字符白名单与旧实现保持一致。 */
const PAGE_FILE_RE = /^src\/pages\/[\w./[\]-]+\.astro$/;
/** 文章自定义版式：src/layouts/posts/<slug>.astro（slug 规则与 content.customize 一致）。 */
const POST_LAYOUT_RE = /^src\/layouts\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.astro$/;

export function isPostLayout(file?: string): boolean {
  if (!file) return false;
  return POST_LAYOUT_RE.test(file.replaceAll('\\', '/'));
}

export function isHtmlPost(file?: string): boolean {
  return Boolean(file && isHtmlPostFile(file));
}

/** 画布可编辑的文件：站点页面、共用版式、单篇文章版式、HTML 文章正文。 */
export function safePage(file?: string): string {
  if (!file) return 'src/pages/index.astro';
  const normalized = file.replaceAll('\\', '/');
  if (normalized.includes('..')) return 'src/pages/index.astro';
  if (
    PAGE_FILE_RE.test(normalized) ||
    POST_LAYOUT_RE.test(normalized) ||
    isSharedLayout(normalized) ||
    isSitePart(normalized) ||
    isHtmlPostFile(normalized)
  ) {
    return normalized;
  }
  return 'src/pages/index.astro';
}

function splitHtmlPost(source: string): { head: string; body: string } {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text);
  if (!match) return { head: '', body: text };
  return { head: match[0], body: text.slice(match[0].length) };
}

function loadCanvasSource(
  siteDir: string,
  file: string,
): { full: string; head: string; doc: ReturnType<typeof parseAstro> } {
  const full = readFileSync(pagePath(siteDir, file), 'utf8');
  if (!isHtmlPost(file)) return { full, head: '', doc: parseAstro(full) };
  const split = splitHtmlPost(full);
  const body = split.body.trim()
    ? split.body
    : '<article class="x-post" data-xiao="container"></article>\n';
  return { full, head: split.head, doc: parseAstro(body) };
}

function commitCanvas(
  siteDir: string,
  file: string,
  before: string,
  head: string,
  nextBody: string,
): string {
  const after = isHtmlPost(file) ? `${head}${nextBody}` : nextBody;
  return writeEdit(pagePath(siteDir, file), before, after);
}

function pagePath(siteDir: string, file = 'src/pages/index.astro'): string {
  return path.join(siteDir, safePage(file));
}

/**
 * 版式文件比页面文件深一层：core 的 importEdits 按页面写死 `../components/xiao/`，
 * 插到 src/layouts/posts/*.astro 时要把新增的组件 import 再往上提一层。
 */
function fixInsertedImports(source: string, file: string): string {
  if (isPostLayout(file)) {
    return source.replace(/(from\s+['"])\.\.\/components\/xiao\//g, '$1../../components/xiao/');
  }
  if (normalizePageFile(file).startsWith('src/components/site/')) {
    return source.replace(/(from\s+['"])\.\.\/components\/xiao\//g, '$1../xiao/');
  }
  return source;
}

/** `<slot />` 是文章正文插槽：结构里受保护，不能删、不能改属性、不能往里塞组件。 */
export function isSlotNode(node: { kind: string; name?: string } | undefined): boolean {
  return Boolean(node && node.kind !== 'locked' && node.name === 'slot');
}

function assertNotSlotParent(doc: ReturnType<typeof parseAstro>, parentId: string): void {
  const parent = findNode(doc.tree, parentId);
  if (isSlotNode(parent)) {
    throw new Error('「正文」块不能包含组件；先把它套进区块或容器，再往里放；正文块本身也不能删除');
  }
}

const histories = new Map<string, FileHistory>();

function writeEdit(full: string, before: string, after: string): string {
  const history = histories.get(full) ?? { past: [], future: [] };
  histories.set(full, recordEdit(history, before));
  writeFileSync(full, after);
  return after;
}

export function readOutline(siteDir: string, file = 'src/pages/index.astro'): OutlineNode[] {
  const html = isHtmlPost(file);
  const { doc } = loadCanvasSource(siteDir, file);
  const walk = (nodes: typeof doc.tree): OutlineNode[] =>
    nodes.map((node) => {
      const text = node.kind === 'text' ? doc.source.slice(node.start, node.end).trim() : '';
      const preview = text.length > 24 ? `${text.slice(0, 24)}…` : text;
      const props = (node.props ?? []).map((prop) => ({
        name: prop.name,
        value: prop.value.parsed === undefined ? prop.value.raw : String(prop.value.parsed),
      }));
      const rawName = node.kind === 'text' ? preview || '文本' : (node.name ?? node.kind);
      return {
        id: node.id,
        name: html && node.kind !== 'text' ? htmlNodeComponent(rawName, props) : rawName,
        kind: node.kind,
        text,
        locked: node.kind === 'locked',
        props,
        children: walk(node.children),
      };
    });
  return walk(doc.tree);
}

export function insertComponent(
  siteDir: string,
  parentId: string,
  index: number,
  component: string,
  file = 'src/pages/index.astro',
): string {
  const spec = manifest.find((item) => item.name === component);
  if (!spec && !/^[A-Z][A-Za-z0-9]*$/.test(component)) {
    throw new Error(`没有组件 ${component}`);
  }
  const loaded = loadCanvasSource(siteDir, file);
  assertNotSlotParent(loaded.doc, parentId);
  const snippet = spec
    ? isHtmlPost(file)
      ? htmlSnippet(component)
      : spec.snippet
    : `<${component} />`;
  const next = fixInsertedImports(insertNode(loaded.doc, parentId, index, snippet), file);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function moveComponent(
  siteDir: string,
  nodeId: string,
  parentId: string,
  index: number,
  file = 'src/pages/index.astro',
): string {
  const loaded = loadCanvasSource(siteDir, file);
  assertNotSlotParent(loaded.doc, parentId);
  const next = fixInsertedImports(moveNode(loaded.doc, nodeId, parentId, index), file);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function removeComponent(
  siteDir: string,
  nodeId: string,
  file = 'src/pages/index.astro',
): string {
  const loaded = loadCanvasSource(siteDir, file);
  const node = findNode(loaded.doc.tree, nodeId);
  if (isSlotNode(node)) throw new Error('「正文」块不能删除');
  const next = removeNode(loaded.doc, nodeId);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function duplicateComponent(
  siteDir: string,
  nodeId: string,
  file = 'src/pages/index.astro',
): string {
  const loaded = loadCanvasSource(siteDir, file);
  const node = findNode(loaded.doc.tree, nodeId);
  if (isSlotNode(node)) throw new Error('「正文」块不能复制');
  const next = duplicateNode(loaded.doc, nodeId);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function nestingAllowed(parentName: string, childName: string): boolean {
  try {
    assertCanNest(parentName, `<${childName}></${childName}>`);
    return true;
  } catch {
    return false;
  }
}

export function setComponentProp(
  siteDir: string,
  nodeId: string,
  name: string,
  value: string | number | boolean,
  file = 'src/pages/index.astro',
): string {
  const loaded = loadCanvasSource(siteDir, file);
  const node = findNode(loaded.doc.tree, nodeId);
  if (isSlotNode(node)) {
    throw new Error('「正文」块受保护：不能改属性；可以在结构里移动它或把它套进容器');
  }
  const next = setProp(loaded.doc, nodeId, name, isHtmlPost(file) ? String(value) : value);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function setVisualText(
  siteDir: string,
  elementId: string,
  text: string,
  file = 'src/pages/index.astro',
): string {
  const loaded = loadCanvasSource(siteDir, file);
  const node = findNode(loaded.doc.tree, elementId);
  if (!node) throw new Error('画面上的这块对不上源码');
  const texts =
    node.kind === 'text' ? [node] : node.children.filter((child) => child.kind === 'text');
  const target = texts.length === 1 ? texts[0] : undefined;
  if (!target) throw new Error('这段是模板代码，不能在画面上改');
  const next = setText(loaded.doc, target.id, text);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function setPageText(
  siteDir: string,
  nodeId: string,
  text: string,
  file = 'src/pages/index.astro',
): string {
  const loaded = loadCanvasSource(siteDir, file);
  const node = findNode(loaded.doc.tree, nodeId);
  if (isSlotNode(node)) {
    throw new Error('「正文」块受保护：不能删除或改它的内容');
  }
  const next = setText(loaded.doc, nodeId, text);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function wrapComponent(
  siteDir: string,
  nodeId: string,
  wrapperSnippet: string,
  file = 'src/pages/index.astro',
): string {
  const loaded = loadCanvasSource(siteDir, file);
  const node = findNode(loaded.doc.tree, nodeId);
  if (isSlotNode(node)) throw new Error('「正文」块不能套容器');
  const next = fixInsertedImports(wrapNode(loaded.doc, nodeId, wrapperSnippet), file);
  return commitCanvas(siteDir, file, loaded.full, loaded.head, next);
}

export function undoPage(siteDir: string, file = 'src/pages/index.astro'): string {
  const full = pagePath(siteDir, file);
  const current = readFileSync(full, 'utf8');
  const step = undoEdit(histories.get(full) ?? { past: [], future: [] }, current);
  histories.set(full, step.history);
  writeFileSync(full, step.text);
  return step.text;
}

export function redoPage(siteDir: string, file = 'src/pages/index.astro'): string {
  const full = pagePath(siteDir, file);
  const current = readFileSync(full, 'utf8');
  const step = redoEdit(histories.get(full) ?? { past: [], future: [] }, current);
  histories.set(full, step.history);
  writeFileSync(full, step.text);
  return step.text;
}
