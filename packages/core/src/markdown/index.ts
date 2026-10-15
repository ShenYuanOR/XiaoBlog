import { acceptWrite, writeBlocks } from './blocks.ts';
import { patchFrontmatter, splitFrontmatter } from './frontmatter.ts';
import { fingerprint, parseMarkdown, stringifyMarkdown } from './parse.ts';
import { sniffStyle, type MarkdownStyle } from './style.ts';

export type { MarkdownStyle } from './style';

export interface MarkdownSession {
  original: string;
  fmRaw: string;
  body: string;
  style: MarkdownStyle;
  base: string;
  dirty: boolean;
}

export interface SaveResult {
  write: boolean;
  text: string;
  reason: 'clean' | 'unchanged' | 'identical' | 'edited' | 'rejected';
}

export function openMarkdown(source: string): MarkdownSession {
  const { fmRaw, body } = splitFrontmatter(source);
  const style = sniffStyle(body);
  return {
    original: source,
    fmRaw,
    body,
    style,
    base: fingerprint(body, style),
    dirty: false,
  };
}

export function markDirty(session: MarkdownSession): MarkdownSession {
  return { ...session, dirty: true };
}

export function saveMarkdown(
  session: MarkdownSession,
  currentBody: string,
  fmPatch?: Readonly<Record<string, string>>,
): SaveResult {
  const fmRaw = fmPatch ? patchFrontmatter(session.fmRaw, fmPatch) : session.fmRaw;
  if (!session.dirty && !fmPatch) return { write: false, text: session.original, reason: 'clean' };
  if (fingerprint(currentBody, session.style) === session.base && !fmPatch) {
    return { write: false, text: session.original, reason: 'unchanged' };
  }
  const newBody = writeBlocks(session.body, currentBody, session.style);
  if (!acceptWrite(newBody, currentBody, session.body, session.style)) {
    return { write: false, text: session.original, reason: 'rejected' };
  }
  const text = `${fmRaw}${newBody}`;
  if (text === session.original) return { write: false, text, reason: 'identical' };
  return { write: true, text, reason: 'edited' };
}

export function simulateEditor(body: string, style: MarkdownStyle): string {
  return stringifyMarkdown(parseMarkdown(body), style);
}

export { splitFrontmatter, patchFrontmatter, sniffStyle, writeBlocks };
