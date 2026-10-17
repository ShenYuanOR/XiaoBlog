import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertCanNest,
  insertNode,
  moveNode,
  parseAstro,
  recordEdit,
  redoEdit,
  setProp,
  undoEdit,
  type FileHistory,
} from '@xiao/core/ast';
import { manifest } from '@xiao/core/components';

export interface OutlineNode {
  id: string;
  name: string;
  kind: string;
  locked: boolean;
  props: { name: string; value: string }[];
  children: OutlineNode[];
}

export function safePage(file?: string): string {
  if (!file || file.includes('..') || !/^src\/pages\/[\w./[\]-]+\.astro$/.test(file)) {
    return 'src/pages/index.astro';
  }
  return file;
}

function pagePath(siteDir: string, file = 'src/pages/index.astro'): string {
  return path.join(siteDir, safePage(file));
}

const histories = new Map<string, FileHistory>();

function writeEdit(full: string, before: string, after: string): string {
  const history = histories.get(full) ?? { past: [], future: [] };
  histories.set(full, recordEdit(history, before));
  writeFileSync(full, after);
  return after;
}

export function readOutline(siteDir: string, file = 'src/pages/index.astro'): OutlineNode[] {
  const doc = parseAstro(readFileSync(pagePath(siteDir, file), 'utf8'));
  const walk = (nodes: typeof doc.tree): OutlineNode[] =>
    nodes.map((node) => ({
      id: node.id,
      name: node.name ?? node.kind,
      kind: node.kind,
      locked: node.kind === 'locked',
      props: (node.props ?? []).map((prop) => ({
        name: prop.name,
        value: prop.value.parsed === undefined ? prop.value.raw : String(prop.value.parsed),
      })),
      children: walk(node.children),
    }));
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
  if (!spec) throw new Error(`没有组件 ${component}`);
  const full = pagePath(siteDir, file);
  const before = readFileSync(full, 'utf8');
  const next = insertNode(parseAstro(before), parentId, index, spec.snippet);
  return writeEdit(full, before, next);
}

export function moveComponent(
  siteDir: string,
  nodeId: string,
  parentId: string,
  index: number,
  file = 'src/pages/index.astro',
): string {
  const full = pagePath(siteDir, file);
  const before = readFileSync(full, 'utf8');
  const next = moveNode(parseAstro(before), nodeId, parentId, index);
  return writeEdit(full, before, next);
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
  const full = pagePath(siteDir, file);
  const before = readFileSync(full, 'utf8');
  const next = setProp(parseAstro(before), nodeId, name, value);
  return writeEdit(full, before, next);
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
