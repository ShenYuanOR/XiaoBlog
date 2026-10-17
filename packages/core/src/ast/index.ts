import prettier from 'prettier';
import * as prettierPluginAstro from 'prettier-plugin-astro';
import { hasDiagnostics, parseSource } from './parse';
import { AstEditError, type AstroDoc } from './types';

export { AstEditError } from './types';
export type { AstroDoc, EditableNode, EditableProp, PropValue } from './types';
export {
  assertDiskUnchanged,
  findNode,
  hashSource,
  assertCanNest,
  duplicateNode,
  insertNode,
  moveNode,
  removeNode,
  removeProp,
  setProp,
  setText,
  wrapNode,
} from './edit';
export { recordEdit, redoEdit, undoEdit } from './history';
export type { FileHistory } from './history';

export function parseAstro(source: string): AstroDoc {
  const parsed = parseSource(source);
  if (hasDiagnostics(parsed.diagnostics)) {
    throw new AstEditError('源文件无法解析');
  }
  return { ...parsed.doc, prettierClean: false };
}

export async function formatAstro(source: string): Promise<string> {
  return prettier.format(source, {
    parser: 'astro',
    plugins: [prettierPluginAstro as unknown as prettier.Plugin],
    astroCompressHTML: 'jsx',
  });
}

export async function detectPrettierClean(source: string): Promise<boolean> {
  return (await formatAstro(source)) === source;
}
