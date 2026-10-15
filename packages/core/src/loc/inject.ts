import { parse } from '@astrojs/compiler-rs';
import MagicString from 'magic-string';

interface OpeningName {
  end: number;
}

interface RawElement {
  type?: string;
  start?: number;
  openingElement?: { name?: OpeningName; end: number };
}

function walk(value: unknown, found: RawElement[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found);
    return;
  }
  const node = value as RawElement;
  if (node.type === 'JSXElement' && node.openingElement?.name && typeof node.start === 'number') {
    found.push(node);
  }
  for (const child of Object.values(value as Record<string, unknown>)) walk(child, found);
}

export function injectLoc(source: string, relativePath: string): string {
  const parsed = parse(source) as { ast?: { body?: unknown[] }; diagnostics?: unknown[] };
  if ((parsed.diagnostics?.length ?? 0) > 0 || !parsed.ast?.body) return source;
  const elements: RawElement[] = [];
  walk(parsed.ast.body, elements);
  const magic = new MagicString(source);
  const seen = new Set<number>();
  for (const element of elements) {
    const nameEnd = element.openingElement?.name?.end;
    const start = element.start;
    if (nameEnd === undefined || start === undefined || seen.has(nameEnd)) continue;
    const openEnd = element.openingElement?.end ?? nameEnd;
    const openTag = source.slice(start, openEnd);
    if (openTag.includes('data-xiao-loc') || openTag.includes('{...')) continue;
    seen.add(nameEnd);
    magic.appendLeft(nameEnd, ` data-xiao-loc="${relativePath}:${start}"`);
  }
  return magic.toString();
}
