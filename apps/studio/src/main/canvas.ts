import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { insertNode, parseAstro, setProp } from '@xiao/core/ast';
import { manifest } from '@xiao/core/components';

export interface OutlineNode {
  id: string;
  name: string;
  kind: string;
  locked: boolean;
  props: { name: string; value: string }[];
  children: OutlineNode[];
}

function pagePath(siteDir: string, file = 'src/pages/index.astro'): string {
  return path.join(siteDir, file);
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
  const doc = parseAstro(readFileSync(full, 'utf8'));
  const next = insertNode(doc, parentId, index, spec.snippet);
  writeFileSync(full, next);
  return next;
}

export function setComponentProp(
  siteDir: string,
  nodeId: string,
  name: string,
  value: string | number | boolean,
  file = 'src/pages/index.astro',
): string {
  const full = pagePath(siteDir, file);
  const doc = parseAstro(readFileSync(full, 'utf8'));
  const next = setProp(doc, nodeId, name, value);
  writeFileSync(full, next);
  return next;
}
