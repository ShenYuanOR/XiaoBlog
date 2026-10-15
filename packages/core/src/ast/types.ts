export type Eol = '\n' | '\r\n';

export type LockedReason = 'expression' | 'script' | 'style' | 'spread' | 'raw';

export interface ImportInfo {
  name: string;
  start: number;
  end: number;
  source: string;
}

export interface EditableProp {
  name: string;
  start: number;
  end: number;
  value: {
    kind: 'string' | 'literal' | 'boolean-flag' | 'locked';
    raw: string;
    parsed?: unknown;
  };
}

export interface EditableNode {
  id: string;
  kind: 'component' | 'element' | 'text' | 'locked';
  name?: string;
  start: number;
  end: number;
  openTag?: { start: number; end: number };
  props?: EditableProp[];
  children: EditableNode[];
  lockedReason?: LockedReason;
}

export interface AstroDoc {
  source: string;
  eol: Eol;
  indentUnit: string;
  prettierClean: boolean;
  tree: EditableNode[];
  imports: ImportInfo[];
}

export type PropValue = string | number | boolean | readonly unknown[];

export class AstEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AstEditError';
  }
}
