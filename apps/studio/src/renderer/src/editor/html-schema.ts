/**
 * HTML 文章的富文本文档模型。
 *
 * 和「页面画布」的区别：页面画布按源码偏移编辑 AST，这里维护一份真实的文档树，
 * 块内是行内富文本，保存时整篇序列化。把手写 HTML 里认不出的结构保留成「原始 HTML」块，
 * 不做静默改写。
 */

import {
  DOMSerializer,
  DOMParser as PMDOMParser,
  Schema,
  type DOMOutputSpec,
  type MarkSpec,
  type Node as PMNode,
  type NodeSpec,
  type NodeType,
} from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

const CALLOUT_CLASS = 'x-callout x-box x-pad-md';
const CARD_CLASS = 'x-box x-pad-md x-bg-surface x-card';
const IMAGE_CLASS = 'x-box';

const headingLevels = [1, 2, 3, 4, 5, 6];

/** 把 id / class 一起写回，空值不落属性。 */
function htmlAttrs(node: PMNode, extra: Record<string, string> = {}): Record<string, string> {
  const attrs = { ...extra };
  const id = node.attrs.id ? String(node.attrs.id) : '';
  const cls = String(node.attrs.class ?? '').trim();
  if (id) attrs.id = id;
  if (cls) attrs.class = cls;
  return attrs;
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: { id: { default: null }, class: { default: '' } },
    parseDOM: [
      {
        tag: 'p',
        getAttrs: (dom: HTMLElement) => ({
          id: dom.getAttribute('id'),
          class: dom.getAttribute('class') ?? '',
        }),
      },
    ],
    toDOM: (node) => ['p', htmlAttrs(node), 0],
  },

  heading: {
    group: 'block',
    content: 'inline*',
    defining: true,
    attrs: { level: { default: 2 }, id: { default: null }, class: { default: '' } },
    parseDOM: headingLevels.map((level) => ({
      tag: `h${level}`,
      getAttrs: (dom: HTMLElement) => ({
        level,
        id: dom.getAttribute('id'),
        class: dom.getAttribute('class') ?? '',
      }),
    })),
    toDOM: (node) => [`h${Number(node.attrs.level) || 2}`, htmlAttrs(node), 0],
  },

  blockquote: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { class: { default: '' } },
    parseDOM: [
      {
        tag: 'blockquote',
        getAttrs: (dom: HTMLElement) => ({ class: dom.getAttribute('class') ?? '' }),
      },
    ],
    toDOM: (node) => ['blockquote', htmlAttrs(node), 0],
  },

  bullet_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { class: { default: '' } },
    parseDOM: [
      {
        tag: 'ul',
        getAttrs: (dom: HTMLElement) => ({ class: dom.getAttribute('class') ?? '' }),
      },
    ],
    toDOM: (node) => ['ul', htmlAttrs(node), 0],
  },

  ordered_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { start: { default: 1 }, class: { default: '' } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom: HTMLElement) => ({
          start: Number(dom.getAttribute('start') ?? '1') || 1,
          class: dom.getAttribute('class') ?? '',
        }),
      },
    ],
    toDOM: (node) => [
      'ol',
      htmlAttrs(node, Number(node.attrs.start) === 1 ? {} : { start: String(node.attrs.start) }),
      0,
    ],
  },

  list_item: {
    content: 'paragraph block*',
    parseDOM: [{ tag: 'li' }],
    toDOM: (): DOMOutputSpec => ['li', 0],
  },

  code_block: {
    group: 'block',
    content: 'text*',
    marks: '',
    defining: true,
    attrs: { language: { default: '' }, class: { default: '' } },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom: HTMLElement) => {
          const code = dom.querySelector('code');
          const cls = code?.getAttribute('class') ?? '';
          const match = /language-([\w+-]+)/.exec(cls);
          return {
            language: match?.[1] ?? '',
            class: dom.getAttribute('class') ?? '',
          };
        },
        contentElement: (dom: HTMLElement) => dom.querySelector('code') ?? dom,
      },
    ],
    toDOM: (node) => {
      const language = String(node.attrs.language ?? '');
      return [
        'pre',
        htmlAttrs(node, { 'data-xiao': 'code' }),
        ['code', language ? { class: `language-${language}` } : {}, 0],
      ];
    },
  },

  horizontal_rule: {
    group: 'block',
    atom: true,
    parseDOM: [{ tag: 'hr' }],
    toDOM: (): DOMOutputSpec => ['hr', { 'data-xiao': 'divider' }],
  },

  image: {
    group: 'block',
    atom: true,
    draggable: true,
    attrs: {
      src: { default: '' },
      alt: { default: '' },
      caption: { default: '' },
      ratio: { default: 'auto' },
      class: { default: IMAGE_CLASS },
    },
    parseDOM: [
      {
        tag: 'figure',
        getAttrs: (dom: HTMLElement) => {
          const img = dom.querySelector('img');
          if (!img) return false;
          return {
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt') ?? '',
            caption: dom.querySelector('figcaption')?.textContent?.trim() ?? '',
            ratio: imageRatio(img.getAttribute('class') ?? ''),
            class: dom.getAttribute('class') ?? IMAGE_CLASS,
          };
        },
      },
      {
        tag: 'img',
        getAttrs: (dom: HTMLElement) => ({
          src: dom.getAttribute('src') ?? '',
          alt: dom.getAttribute('alt') ?? '',
          caption: '',
          ratio: imageRatio(dom.getAttribute('class') ?? ''),
          class: IMAGE_CLASS,
        }),
      },
    ],
    toDOM: (node) => {
      const ratio = String(node.attrs.ratio ?? 'auto');
      const imgClass = ['x-media', ratio !== 'auto' ? `x-ratio-${ratio}` : '']
        .filter(Boolean)
        .join(' ');
      const spec: unknown[] = [
        'figure',
        htmlAttrs(node, { 'data-xiao': 'image' }),
        ['img', { class: imgClass, src: String(node.attrs.src), alt: String(node.attrs.alt) }],
      ];
      if (node.attrs.caption) spec.push(['figcaption', String(node.attrs.caption)]);
      return spec as unknown as DOMOutputSpec;
    },
  },

  callout: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { type: { default: 'info' }, class: { default: CALLOUT_CLASS } },
    parseDOM: [
      {
        tag: 'aside',
        getAttrs: (dom: HTMLElement) => {
          const cls = dom.getAttribute('class') ?? '';
          const xiao = dom.getAttribute('data-xiao');
          if (!cls.split(/\s+/).includes('x-callout') && xiao !== 'callout') return false;
          return {
            type: dom.getAttribute('data-type') ?? 'info',
            class: cls.trim() || CALLOUT_CLASS,
          };
        },
      },
    ],
    toDOM: (node) => [
      'aside',
      {
        class: String(node.attrs.class || CALLOUT_CLASS),
        'data-xiao': 'callout',
        'data-type': String(node.attrs.type || 'info'),
      },
      0,
    ],
  },

  card: {
    group: 'block',
    content: 'block+',
    defining: true,
    attrs: { class: { default: CARD_CLASS } },
    parseDOM: [
      {
        tag: 'article',
        getAttrs: (dom: HTMLElement) => {
          const cls = dom.getAttribute('class') ?? '';
          const xiao = dom.getAttribute('data-xiao');
          if (!cls.split(/\s+/).includes('x-card') && xiao !== 'card') return false;
          return { class: cls.trim() || CARD_CLASS };
        },
      },
    ],
    toDOM: (node) => [
      'article',
      {
        class: String(node.attrs.class || CARD_CLASS),
        'data-xiao': 'card',
      },
      0,
    ],
  },

  /** 认不出的结构原样保留：只展示，不进文档模型。 */
  html_block: {
    group: 'block',
    atom: true,
    attrs: { html: { default: '' } },
    toDOM: (node): DOMOutputSpec => ['div', { 'data-html-block': '1' }, String(node.attrs.html)],
  },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: (): DOMOutputSpec => ['br'],
  },

  text: { group: 'inline' },
};

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: (): DOMOutputSpec => ['strong', 0],
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
    toDOM: (): DOMOutputSpec => ['em', 0],
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
    toDOM: (): DOMOutputSpec => ['s', 0],
  },
  code: {
    code: true,
    parseDOM: [{ tag: 'code' }],
    toDOM: (): DOMOutputSpec => ['code', 0],
  },
  underline: {
    parseDOM: [{ tag: 'u' }],
    toDOM: (): DOMOutputSpec => ['u', 0],
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom: HTMLElement) => ({
          href: dom.getAttribute('href'),
          title: dom.getAttribute('title'),
        }),
      },
    ],
    toDOM: (mark) => {
      const attrs: Record<string, string> = { href: String(mark.attrs.href) };
      if (mark.attrs.title) attrs.title = String(mark.attrs.title);
      return ['a', attrs, 0];
    },
  },
};

function imageRatio(classes: string): string {
  const match = /\bx-ratio-(1x1|4x3|16x9|21x9)\b/.exec(classes);
  return match?.[1] ?? 'auto';
}

export const schema = new Schema({ nodes, marks });

function nodeType(name: string): NodeType {
  const found = schema.nodes[name];
  if (!found) throw new Error(`缺少节点类型：${name}`);
  return found;
}

/* ------------------------------------------------------------------ */
/* 解析：能认的进文档，认不出的整块保留                                  */
/* ------------------------------------------------------------------ */

const INLINE_TAGS = new Set([
  'a',
  'strong',
  'b',
  'em',
  'i',
  's',
  'del',
  'strike',
  'code',
  'u',
  'br',
  'span',
]);

const BLOCK_TAGS = new Set([
  'p',
  'blockquote',
  'ul',
  'ol',
  'pre',
  'hr',
  'figure',
  'img',
  'aside',
  'article',
  'div',
  'a',
  ...headingLevels.map((level) => `h${level}`),
]);

const LINK_ATTRS = new Set(['href', 'title']);
const IMAGE_ATTRS = new Set(['src', 'alt', 'title', 'loading', 'width', 'height', 'class']);

function classTokens(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

function onlyAttrs(el: Element, allowed: readonly string[]): boolean {
  return Array.from(el.attributes).every((attr) => allowed.includes(attr.name));
}

function inlineNodeOk(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (!INLINE_TAGS.has(tag)) return false;
  if (tag === 'a') {
    if (!onlyAttrs(el, [...LINK_ATTRS])) return false;
  } else if (!onlyAttrs(el, [])) {
    return false;
  }
  return Array.from(el.childNodes).every(
    (child) =>
      child.nodeType === Node.TEXT_NODE ||
      (child.nodeType === Node.ELEMENT_NODE && inlineNodeOk(child as Element)),
  );
}

function inlineChildrenOk(el: Element): boolean {
  return Array.from(el.childNodes).every(
    (child) =>
      child.nodeType === Node.TEXT_NODE ||
      (child.nodeType === Node.ELEMENT_NODE && inlineNodeOk(child as Element)),
  );
}

function listItemOk(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'li') return false;
  if (!onlyAttrs(el, [])) return false;
  return Array.from(el.childNodes).every((child) => {
    if (child.nodeType === Node.TEXT_NODE) return true;
    if (child.nodeType !== Node.ELEMENT_NODE) return false;
    const node = child as Element;
    const tag = node.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') return listOk(node);
    if (tag === 'p') return onlyAttrs(node, ['id', 'class']) && inlineChildrenOk(node);
    return false;
  });
}

function listOk(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'ul' && tag !== 'ol') return false;
  if (!onlyAttrs(el, tag === 'ol' ? ['start', 'class'] : ['class'])) return false;
  return Array.from(el.children).every((child) => listItemOk(child));
}

function figureOk(el: Element): boolean {
  if (el.tagName.toLowerCase() === 'img') return onlyAttrs(el, [...IMAGE_ATTRS]);
  if (el.tagName.toLowerCase() !== 'figure') return false;
  if (!onlyAttrs(el, ['class', 'data-xiao'])) return false;
  const tokens = classTokens(el);
  const declared = el.getAttribute('data-xiao') === 'image';
  if (!declared && tokens.length && !tokens.includes('x-box') && !tokens.includes('x-image')) {
    return false;
  }
  const images = Array.from(el.children).filter((child) => child.tagName.toLowerCase() === 'img');
  const image = images[0];
  if (images.length !== 1 || !image) return false;
  if (!onlyAttrs(image, [...IMAGE_ATTRS])) return false;
  const caption = el.querySelector('figcaption');
  if (caption) {
    if (!onlyAttrs(caption, [])) return false;
    if (!inlineChildrenOk(caption)) return false;
  }
  return Array.from(el.children).every((child) =>
    ['img', 'figcaption'].includes(child.tagName.toLowerCase()),
  );
}

function preOk(el: Element): boolean {
  if (!onlyAttrs(el, ['class', 'data-xiao'])) return false;
  const children = Array.from(el.children);
  if (children.length === 0) return true;
  const code = children[0];
  if (children.length > 1 || !code || code.tagName.toLowerCase() !== 'code') return false;
  if (!onlyAttrs(code, ['class'])) return false;
  const cls = code.getAttribute('class') ?? '';
  return !cls || /^(language-[\w+-]+\s*)+$/.test(cls);
}

function calloutOk(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'aside') return false;
  if (!onlyAttrs(el, ['class', 'data-xiao', 'data-type'])) return false;
  const tokens = classTokens(el);
  if (!tokens.includes('x-callout') && el.getAttribute('data-xiao') !== 'callout') return false;
  return blocksOk(el);
}

function cardOk(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'article') return false;
  if (!onlyAttrs(el, ['class', 'data-xiao'])) return false;
  const tokens = classTokens(el);
  if (!tokens.includes('x-card') && el.getAttribute('data-xiao') !== 'card') return false;
  return blocksOk(el);
}

function blockElementOk(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (!BLOCK_TAGS.has(tag)) return false;
  if (/^h[1-6]$/.test(tag)) return onlyAttrs(el, ['id', 'class']) && inlineChildrenOk(el);
  switch (tag) {
    case 'p':
      return onlyAttrs(el, ['id', 'class']) && inlineChildrenOk(el);
    case 'blockquote':
      return onlyAttrs(el, ['class']) && blocksOk(el);
    case 'ul':
    case 'ol':
      return listOk(el);
    case 'pre':
      return preOk(el);
    case 'hr':
      return onlyAttrs(el, []);
    case 'figure':
    case 'img':
      return figureOk(el);
    case 'aside':
      return calloutOk(el);
    case 'article':
      return cardOk(el);
    default:
      return false;
  }
}

function blocksOk(el: Element): boolean {
  return Array.from(el.childNodes).every((child) => {
    if (child.nodeType === Node.TEXT_NODE) return !child.textContent?.trim();
    if (child.nodeType !== Node.ELEMENT_NODE) return false;
    return blockElementOk(child as Element);
  });
}

/** `<article class="x-post">` / `<div class="x-prose">` 这类纯包装不占块位。 */
function isTransparentWrapper(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'article' && tag !== 'div') return false;
  if (!onlyAttrs(el, ['class'])) return false;
  const tokens = classTokens(el);
  return tokens.includes('x-post') || tokens.includes('x-prose');
}

const parser = PMDOMParser.fromSchema(schema);

function parseElement(el: Element): PMNode[] {
  const wrapper = document.createElement('div');
  wrapper.appendChild(el.cloneNode(true));
  const doc = parser.parse(wrapper);
  const out: PMNode[] = [];
  doc.forEach((node) => out.push(node));
  return out;
}

function htmlBlockOf(html: string): PMNode {
  return nodeType('html_block').create({ html });
}

function appendBlocks(parent: ParentNode, blocks: PMNode[]): void {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? '';
      if (text.trim()) {
        blocks.push(nodeType('paragraph').create(null, schema.text(text.trim())));
      }
      continue;
    }
    if (child.nodeType === Node.COMMENT_NODE) {
      blocks.push(htmlBlockOf(`<!--${child.textContent ?? ''}-->`));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    if (isTransparentWrapper(el)) {
      appendBlocks(el, blocks);
      continue;
    }
    if (blockElementOk(el)) {
      blocks.push(...parseElement(el));
      continue;
    }
    blocks.push(htmlBlockOf(el.outerHTML));
  }
}

export function parseArticleHtml(html: string): PMNode {
  const container = document.createElement('div');
  container.innerHTML = html;
  const blocks: PMNode[] = [];
  appendBlocks(container, blocks);
  if (!blocks.length) blocks.push(nodeType('paragraph').create());
  return nodeType('doc').create(null, blocks);
}

/* ------------------------------------------------------------------ */
/* 序列化：整篇写回，html_block 原样输出                                 */
/* ------------------------------------------------------------------ */

export function serializeArticle(doc: PMNode): string {
  const serializer = DOMSerializer.fromSchema(schema);
  const parts: string[] = [];
  doc.forEach((node) => {
    if (node.type === nodeType('html_block')) {
      parts.push(String(node.attrs.html).trim());
      return;
    }
    const dom = serializer.serializeNode(node, { document });
    parts.push(dom instanceof HTMLElement ? dom.outerHTML : (dom.textContent ?? ''));
  });
  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/* 块数据与插入                                                  */
/* ------------------------------------------------------------------ */

export interface BlockRange {
  index: number;
  from: number;
  to: number;
  node: PMNode;
}

const BLOCK_LABELS: Record<string, string> = {
  paragraph: '段落',
  blockquote: '引用',
  bullet_list: '无序列表',
  ordered_list: '有序列表',
  code_block: '代码块',
  horizontal_rule: '分隔线',
  image: '图片',
  callout: '提示框',
  card: '卡片',
  html_block: '原始 HTML',
};

export function blockLabel(node: PMNode): string {
  if (node.type.name === 'heading') return `标题 ${node.attrs.level}`;
  return BLOCK_LABELS[node.type.name] ?? node.type.name;
}

export function blockAtIndex(doc: PMNode, index: number): BlockRange | null {
  const count = doc.childCount;
  if (index < 0 || index >= count) return null;
  let offset = 0;
  for (let i = 0; i < index; i += 1) offset += doc.child(i).nodeSize;
  const node = doc.child(index);
  return { index, from: offset, to: offset + node.nodeSize, node };
}

export function blockIndexAt(doc: PMNode, pos: number): number | null {
  if (pos < 0) return null;
  if (pos >= doc.content.size) return doc.childCount ? doc.childCount - 1 : null;
  const resolved = doc.resolve(pos);
  const index = resolved.index(0);
  return index >= 0 && index < doc.childCount ? index : null;
}

export function paragraph(text = ''): PMNode {
  return nodeType('paragraph').create(null, text ? schema.text(text) : undefined);
}

export function heading(level: number, text = ''): PMNode {
  return nodeType('heading').create({ level }, text ? schema.text(text) : undefined);
}

export function list(ordered: boolean, text = ''): PMNode {
  const item = nodeType('list_item').create(null, paragraph(text));
  return nodeType(ordered ? 'ordered_list' : 'bullet_list').create(null, item);
}

export function quote(text = ''): PMNode {
  return nodeType('blockquote').create(null, paragraph(text));
}

export function codeBlock(text = '', language = ''): PMNode {
  return nodeType('code_block').create(
    { language, class: 'x-code x-box x-pad-md' },
    text ? schema.text(text) : undefined,
  );
}

export function image(src = '', alt = '', caption = ''): PMNode {
  return nodeType('image').create({ src, alt, caption });
}

export function divider(): PMNode {
  return nodeType('horizontal_rule').create();
}

export function callout(type = 'info', text = '提示内容'): PMNode {
  return nodeType('callout').create({ type }, paragraph(text));
}

export function card(text = '卡片内容'): PMNode {
  return nodeType('card').create(null, paragraph(text));
}

export function rawHtml(html = '<div>在这里写 HTML</div>'): PMNode {
  return nodeType('html_block').create({ html });
}

/** 新插入的块如果本身不能放光标（图片、分隔线、原始 HTML），后面补一个空段落。 */
export function needsTrailingParagraph(node: PMNode): boolean {
  return node.isAtom || !node.isTextblock;
}

export function emptyParagraphIfNeeded(doc: PMNode): PMNode | null {
  const last = doc.lastChild;
  if (!last) return paragraph();
  if (last.type.name === 'paragraph' && last.content.size === 0) return null;
  if (needsTrailingParagraph(last)) return paragraph();
  return null;
}

/** 把光标放进 from 处的块里（容器会落到它内部最近的文本位置）。 */
export function placeCursorIn(view: EditorView, from: number): void {
  const state = view.state;
  const pos = Math.max(0, Math.min(from + 1, state.doc.content.size));
  try {
    const selection = TextSelection.near(state.doc.resolve(pos));
    view.dispatch(state.tr.setSelection(selection).scrollIntoView());
  } catch {
    // 附近没有可落光标的文本块时保持原选择。
  }
}
