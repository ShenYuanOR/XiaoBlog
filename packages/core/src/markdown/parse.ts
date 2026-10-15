import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import type { MarkdownStyle } from './style.ts';

interface MdastNode {
  type: string;
  value?: string;
  alt?: string | null;
  meta?: string | null;
  children?: MdastNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

interface RootNode extends MdastNode {
  type: 'root';
  children: MdastNode[];
}

function engine(style?: MarkdownStyle) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkStringify, style ? toStringifyOptions(style) : undefined);
}

function toStringifyOptions(style: MarkdownStyle) {
  return {
    bullet: style.bullet,
    bulletOrdered: '.',
    rule: style.rule,
    emphasis: style.emphasis,
    strong: style.strong,
    fence: style.fence,
    listItemIndent: style.listItemIndent,
  } as const;
}

export function parseMarkdown(source: string): RootNode {
  return engine().parse(source) as RootNode;
}

export function stringifyMarkdown(tree: RootNode, style: MarkdownStyle): string {
  return String(engine(style).stringify(tree as never));
}

export function stripPosition(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripPosition);
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'position') continue;
    next[key] = stripPosition(child);
  }
  return next;
}

function mergeText(children: MdastNode[]): MdastNode[] {
  const merged: MdastNode[] = [];
  for (const child of children) {
    const prev = merged[merged.length - 1];
    if (child.type === 'text' && prev?.type === 'text') {
      prev.value = `${prev.value ?? ''}${child.value ?? ''}`;
      continue;
    }
    merged.push(child);
  }
  return merged;
}

function soften(node: MdastNode): MdastNode {
  if (node.type === 'break') return { type: 'text', value: '\n' };
  if (!node.children) return node;
  const children = node.children.map((child) => soften(child));
  return { ...node, children: mergeText(children) };
}

export function fingerprint(source: string, style: MarkdownStyle): string {
  const tree = soften(parseMarkdown(source)) as RootNode;
  return stringifyMarkdown(tree, style).trim();
}

export function sameTree(left: string, right: string): boolean {
  return (
    JSON.stringify(stripPosition(parseMarkdown(left))) ===
    JSON.stringify(stripPosition(parseMarkdown(right)))
  );
}
