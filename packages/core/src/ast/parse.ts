import { parse } from '@astrojs/compiler-rs';
import type { AstroDoc, EditableNode, EditableProp, Eol, ImportInfo, LockedReason } from './types';

interface SpanNode {
  type: string;
  start: number;
  end: number;
  name?: { type?: string; name?: string };
  value?: SpanNode | null;
  raw?: string;
  openingElement?: SpanNode;
  closingElement?: SpanNode | null;
  children?: SpanNode[];
  attributes?: SpanNode[];
  selfClosing?: boolean;
  expression?: SpanNode;
  argument?: SpanNode;
  specifiers?: SpanNode[];
  source?: { value?: string; start: number; end: number };
  local?: { name?: string };
}

interface ParseResult {
  ast: {
    body?: SpanNode[];
    frontmatter?: { program?: { body?: SpanNode[] } };
    diagnostics?: unknown[];
  };
  diagnostics?: unknown[];
}

function isWhitespace(text: string): boolean {
  return text.trim().length === 0;
}

function elementName(node: SpanNode): string {
  return node.name?.name ?? '';
}

function isComponentName(name: string): boolean {
  const first = name.codePointAt(0);
  return first !== undefined && first >= 65 && first <= 90;
}

function propFromAttribute(attr: SpanNode): EditableProp | undefined {
  if (attr.type === 'JSXSpreadAttribute') return undefined;
  const name = elementName(attr);
  if (!name || attr.type !== 'JSXAttribute') return undefined;
  if (attr.value == null) {
    return {
      name,
      start: attr.start,
      end: attr.end,
      value: { kind: 'boolean-flag', raw: '' },
    };
  }
  const value = attr.value;
  if (value.type === 'Literal') {
    const raw = typeof value.raw === 'string' ? value.raw : String(value.value);
    return {
      name,
      start: attr.start,
      end: attr.end,
      value: { kind: 'string', raw, parsed: value.value },
    };
  }
  if (value.type === 'JSXExpressionContainer') {
    const expression = value.expression;
    if (!expression || expression.type === 'JSXEmptyExpression') return undefined;
    if (expression.type === 'Literal') {
      const raw = typeof expression.raw === 'string' ? expression.raw : String(expression.value);
      return {
        name,
        start: attr.start,
        end: attr.end,
        value: { kind: 'literal', raw, parsed: expression.value },
      };
    }
    const raw = '';
    return {
      name,
      start: attr.start,
      end: attr.end,
      value: { kind: 'locked', raw },
    };
  }
  return {
    name,
    start: attr.start,
    end: attr.end,
    value: { kind: 'locked', raw: '' },
  };
}

function lockedReasonForElement(node: SpanNode, name: string): LockedReason | undefined {
  if (name === 'script') return 'script';
  if (name === 'style') return 'style';
  const attrs = node.openingElement?.attributes ?? [];
  if (attrs.some((attr) => attr.type === 'JSXAttribute' && elementName(attr) === 'is:raw'))
    return 'raw';
  if (attrs.some((attr) => attr.type === 'JSXSpreadAttribute')) return 'spread';
  return undefined;
}

function toNode(node: SpanNode): EditableNode | undefined {
  if (node.type === 'JSXText') {
    const text = typeof node.value === 'string' ? node.value : '';
    if (isWhitespace(text)) return undefined;
    return {
      id: String(node.start),
      kind: 'text',
      start: node.start,
      end: node.end,
      children: [],
    };
  }
  if (node.type === 'JSXExpressionContainer') {
    if (node.expression?.type === 'JSXEmptyExpression') return undefined;
    return {
      id: String(node.start),
      kind: 'locked',
      start: node.start,
      end: node.end,
      children: [],
      lockedReason: 'expression',
    };
  }
  if (node.type === 'JSXFragment') {
    return {
      id: String(node.start),
      kind: 'locked',
      start: node.start,
      end: node.end,
      children: [],
      lockedReason: 'expression',
    };
  }
  if (node.type !== 'JSXElement' || !node.openingElement) return undefined;
  const name = elementName(node.openingElement);
  const reason = lockedReasonForElement(node, name);
  const structuralLock = reason === 'script' || reason === 'style' || reason === 'raw';
  const props = structuralLock
    ? []
    : (node.openingElement.attributes ?? [])
        .map(propFromAttribute)
        .filter((prop): prop is EditableProp => prop !== undefined);
  const children = structuralLock
    ? []
    : (node.children ?? [])
        .map(toNode)
        .filter((child): child is EditableNode => child !== undefined);
  const kind = structuralLock ? 'locked' : isComponentName(name) ? 'component' : 'element';
  return {
    id: String(node.start),
    kind,
    name,
    start: node.start,
    end: node.end,
    openTag: { start: node.openingElement.start, end: node.openingElement.end },
    props,
    children,
    ...(reason ? { lockedReason: reason } : {}),
  };
}

function sniffEol(source: string): Eol {
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function sniffIndent(source: string): string {
  const match = source.match(/\n([\t ]+)\S/);
  return match?.[1] ?? '  ';
}

function readImports(programBody: SpanNode[] | undefined): ImportInfo[] {
  if (!programBody) return [];
  const imports: ImportInfo[] = [];
  for (const statement of programBody) {
    if (statement.type !== 'ImportDeclaration') continue;
    const specifier = statement.specifiers?.[0];
    const name = specifier?.local?.name;
    const source = statement.source?.value;
    if (!name || !source) continue;
    imports.push({ name, start: statement.start, end: statement.end, source });
  }
  return imports;
}

export function parseSource(source: string): {
  doc: Omit<AstroDoc, 'prettierClean'>;
  diagnostics: unknown[];
} {
  const result = parse(source) as ParseResult;
  const diagnostics = result.diagnostics ?? result.ast.diagnostics ?? [];
  const tree = (result.ast.body ?? [])
    .map(toNode)
    .filter((node): node is EditableNode => node !== undefined);
  return {
    doc: {
      source,
      eol: sniffEol(source),
      indentUnit: sniffIndent(source),
      tree,
      imports: readImports(result.ast.frontmatter?.program?.body),
    },
    diagnostics,
  };
}

export function hasDiagnostics(diagnostics: unknown[]): boolean {
  return diagnostics.length > 0;
}
