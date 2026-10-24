import { fingerprint, parseMarkdown, sameTree } from './parse.ts';
import type { MarkdownStyle } from './style.ts';

interface MdastNode {
  type: string;
  value?: string;
  alt?: string | null;
  meta?: string | null;
  children?: MdastNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

interface Block {
  start: number;
  end: number;
  slice: string;
  fp: string;
  guarded: boolean;
}

function nodeSlice(source: string, node: MdastNode): string | undefined {
  const offset = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (offset === undefined || end === undefined) return undefined;
  return source.slice(offset, end);
}

function isImageAlt(node: MdastNode): boolean {
  const children = node.children ?? [];
  const meaningful = children.filter(
    (child) => child.type !== 'text' || (child.value ?? '').trim().length > 0,
  );
  const only = meaningful[0];
  if (meaningful.length !== 1 || only?.type !== 'image') return false;
  return Boolean(only.alt && only.alt.trim().length > 0);
}

function hasBackslashAutolink(slice: string): boolean {
  return /<[^>\n]*\\[^>\n]*>/.test(slice);
}

function hasContainer(slice: string): boolean {
  return /^:::/m.test(slice);
}

function isXiaoHtml(slice: string): boolean {
  return /data-xiao\s*=/.test(slice);
}

export function isGuarded(node: MdastNode, slice: string): boolean {
  if (node.type === 'html') return !isXiaoHtml(slice);
  if (node.type === 'definition') return true;
  if (node.type === 'code' && Boolean(node.meta)) return true;
  if (node.type === 'paragraph' && isImageAlt(node)) return true;
  if (hasBackslashAutolink(slice) || hasContainer(slice)) return true;
  return false;
}

function readBlocks(source: string, style: MarkdownStyle): Block[] {
  const tree = parseMarkdown(source);
  const blocks: Block[] = [];
  for (const node of tree.children) {
    const slice = nodeSlice(source, node);
    const offset = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (slice === undefined || offset === undefined || end === undefined) continue;
    blocks.push({
      start: offset,
      end,
      slice,
      fp: fingerprint(slice, style),
      guarded: isGuarded(node, slice),
    });
  }
  return blocks;
}

interface Edit {
  kind: 'keep' | 'drop' | 'insert';
  index: number;
}

function align(original: readonly Block[], current: readonly Block[]): Edit[] {
  const rows = original.length;
  const cols = current.length;
  const scores: number[][] = Array.from({ length: rows + 1 }, () =>
    Array<number>(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      const down = scores[i + 1]?.[j] ?? 0;
      const right = scores[i]?.[j + 1] ?? 0;
      const diag = (scores[i + 1]?.[j + 1] ?? 0) + 1;
      const row = scores[i];
      if (!row) continue;
      row[j] = original[i]?.fp === current[j]?.fp ? diag : Math.max(down, right);
    }
  }
  const edits: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (original[i]?.fp === current[j]?.fp) {
      edits.push({ kind: 'keep', index: i });
      i += 1;
      j += 1;
      continue;
    }
    const down = scores[i + 1]?.[j] ?? 0;
    const right = scores[i]?.[j + 1] ?? 0;
    if (down >= right) {
      edits.push({ kind: 'drop', index: i });
      i += 1;
    } else {
      edits.push({ kind: 'insert', index: j });
      j += 1;
    }
  }
  while (i < rows) {
    edits.push({ kind: 'drop', index: i });
    i += 1;
  }
  while (j < cols) {
    edits.push({ kind: 'insert', index: j });
    j += 1;
  }
  return edits;
}

function blank(text: string): string {
  if (!text) return '';
  return text.endsWith('\n\n') || text.endsWith('\r\n\r\n') ? '' : '\n\n';
}

export function writeBlocks(
  originalBody: string,
  currentBody: string,
  style: MarkdownStyle,
): string {
  const original = readBlocks(originalBody, style);
  const current = readBlocks(currentBody, style);
  if (original.length === 0) return currentBody;
  const edits = align(original, current);
  let out = '';
  let cursor = 0;
  let linked = true;
  for (const edit of edits) {
    if (edit.kind === 'drop') {
      const block = original[edit.index];
      if (linked && block && cursor <= block.start) cursor = block.end;
      continue;
    }
    if (edit.kind === 'keep') {
      const block = original[edit.index];
      if (!block) continue;
      if (linked && cursor <= block.start) {
        out += originalBody.slice(cursor, block.end);
        cursor = block.end;
      } else {
        out += `${blank(out)}${block.slice.trim()}`;
        linked = false;
        cursor = block.end;
      }
      continue;
    }
    const block = current[edit.index];
    if (!block) continue;
    out += `${blank(out)}${block.slice.trim()}`;
    linked = false;
  }
  if (linked) out += originalBody.slice(cursor);
  else if (originalBody.endsWith('\n') && !out.endsWith('\n'))
    out += originalBody.endsWith('\r\n') ? '\r\n' : '\n';
  return out;
}

export function editedGuardLabels(
  originalBody: string,
  currentBody: string,
  style: MarkdownStyle,
): string[] {
  const original = readBlocks(originalBody, style).filter((block) => block.guarded);
  const currentFps = new Set(readBlocks(currentBody, style).map((block) => block.fp));
  return original
    .filter((block) => !currentFps.has(block.fp) && !currentBody.includes(block.slice.trim()))
    .map((block) => block.slice.trim().slice(0, 48));
}

export function acceptWrite(
  newBody: string,
  currentBody: string,
  originalBody: string,
  style: MarkdownStyle,
): boolean {
  if (sameTree(newBody, currentBody)) return true;
  const guards = readBlocks(originalBody, style).filter((block) => block.guarded);
  return guards.every((block) => newBody.includes(block.slice.trim()));
}
