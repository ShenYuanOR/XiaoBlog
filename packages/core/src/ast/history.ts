import { hasDiagnostics, parseSource } from './parse';
import { AstEditError } from './types';

export interface FileHistory {
  past: string[];
  future: string[];
}

export function recordEdit(history: FileHistory, before: string): FileHistory {
  return { past: [...history.past, before].slice(-100), future: [] };
}

function assertParses(source: string): void {
  const parsed = parseSource(source);
  if (hasDiagnostics(parsed.diagnostics)) throw new AstEditError('快照无法解析');
}

export function undoEdit(
  history: FileHistory,
  current: string,
): { history: FileHistory; text: string } {
  const text = history.past.at(-1);
  if (text === undefined) throw new AstEditError('没有可撤销的修改');
  assertParses(text);
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, current] },
    text,
  };
}

export function redoEdit(
  history: FileHistory,
  current: string,
): { history: FileHistory; text: string } {
  const text = history.future.at(-1);
  if (text === undefined) throw new AstEditError('没有可重做的修改');
  assertParses(text);
  return {
    history: { past: [...history.past, current], future: history.future.slice(0, -1) },
    text,
  };
}
