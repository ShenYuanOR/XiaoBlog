<script setup lang="ts">
/**
 * HTML 文章编辑器：一份真实文档树，块内富文本，整篇写回。
 *
 * - 正文在 Shadow DOM 里用站点自己的 base/prose/xiao/custom.css 渲染，工具条留在 Studio 主题里。
 * - 认不出的手写结构保留成「原始 HTML」块，保存时原样写回。
 * - 撤销、拖动排序、斜杠插入、行内格式、粘贴图片都交给 ProseMirror。
 */

import {
  mdiAlertCircleOutline,
  mdiArrowDown,
  mdiArrowUp,
  mdiCardTextOutline,
  mdiCodeBraces,
  mdiCodeTags,
  mdiContentCopy,
  mdiDeleteOutline,
  mdiDragVertical,
  mdiFormatBold,
  mdiFormatHeader2,
  mdiFormatHeader3,
  mdiFormatItalic,
  mdiFormatListBulleted,
  mdiFormatListNumbered,
  mdiFormatParagraph,
  mdiFormatQuoteClose,
  mdiFormatStrikethroughVariant,
  mdiImageOutline,
  mdiLinkVariant,
  mdiMinus,
  mdiPlus,
} from '@mdi/js';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { Decoration, DecorationSet, EditorView, type NodeView } from 'prosemirror-view';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, Plugin, type Transaction } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { notify } from '../notice.ts';
import { UiButton, UiDialog, UiIcon, UiSpinner } from '../ui/index.ts';
import {
  blockAtIndex,
  blockIndexAt,
  blockLabel,
  callout,
  card,
  codeBlock,
  divider,
  heading,
  image as imageNode,
  list,
  needsTrailingParagraph,
  paragraph,
  parseArticleHtml,
  placeCursorIn,
  quote,
  rawHtml,
  schema,
  serializeArticle,
} from '../editor/html-schema.ts';
import {
  STYLEABLE_TYPES,
  TEXT_TYPES,
  splitClasses,
  type HtmlBlockInfo,
} from '../editor/block-style.ts';
import { imageDisplaySrc } from '../editor/asset-url.ts';

interface Props {
  siteDir: string;
  slug: string;
  html: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  change: [text: string];
  select: [block: HtmlBlockInfo | null];
}>();

const hostEl = ref<HTMLElement | null>(null);
const scrollEl = ref<HTMLElement | null>(null);
const menuInput = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

let view: EditorView | undefined;
let surface: HTMLElement | undefined;
let styleEl: HTMLStyleElement | undefined;

/* ------------------------------------------------------------------ */
/* 工具条 / 菜单状态                                                    */
/* ------------------------------------------------------------------ */

const hoverIndex = ref<number | null>(null);
const hoverPos = ref<{ top: number; left: number } | null>(null);
const hoverLabel = ref('');
const hoverIsHtml = ref(false);

const menu = reactive({
  open: false,
  mode: 'slash' as 'slash' | 'append',
  index: 0,
  x: 0,
  y: 0,
  query: '',
  target: 0,
});

const bubble = ref<{ top: number; left: number } | null>(null);
const bubbleMarks = reactive({ strong: false, em: false, strike: false, code: false, link: false });
const link = reactive({ open: false, value: '' });

const raw = reactive({ open: false, from: -1, value: '' });
const uploading = ref(false);
const pendingImage = ref<{ mode: 'slash' | 'append'; target: number } | null>(null);

interface InsertItem {
  key: string;
  label: string;
  hint: string;
  group: '基础' | '媒体' | '组件';
  icon: string;
  make: () => PMNode | null;
}

const INSERT_ITEMS: InsertItem[] = [
  { key: 'paragraph', label: '段落', hint: 'P', group: '基础', icon: mdiFormatParagraph, make: () => paragraph() },
  { key: 'h2', label: '标题 2', hint: 'H2', group: '基础', icon: mdiFormatHeader2, make: () => heading(2) },
  { key: 'h3', label: '标题 3', hint: 'H3', group: '基础', icon: mdiFormatHeader3, make: () => heading(3) },
  { key: 'ul', label: '无序列表', hint: 'UL', group: '基础', icon: mdiFormatListBulleted, make: () => list(false) },
  { key: 'ol', label: '有序列表', hint: 'OL', group: '基础', icon: mdiFormatListNumbered, make: () => list(true) },
  { key: 'quote', label: '引用', hint: 'Quote', group: '基础', icon: mdiFormatQuoteClose, make: () => quote() },
  { key: 'code', label: '代码块', hint: 'Code', group: '基础', icon: mdiCodeBraces, make: () => codeBlock() },
  { key: 'divider', label: '分隔线', hint: 'HR', group: '基础', icon: mdiMinus, make: () => divider() },
  { key: 'image', label: '图片', hint: '上传或插入', group: '媒体', icon: mdiImageOutline, make: () => null },
  { key: 'callout', label: '提示框', hint: 'Callout', group: '组件', icon: mdiAlertCircleOutline, make: () => callout() },
  { key: 'card', label: '卡片', hint: 'Card', group: '组件', icon: mdiCardTextOutline, make: () => card() },
  { key: 'raw', label: '原始 HTML', hint: '手写片段', group: '组件', icon: mdiCodeTags, make: () => rawHtml() },
];

const filteredItems = computed(() => {
  const query = menu.query.trim().toLowerCase();
  if (!query) return INSERT_ITEMS;
  return INSERT_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(query) ||
      item.hint.toLowerCase().includes(query) ||
      item.key.includes(query),
  );
});

const filteredGroups = computed(() => {
  const groups: { label: string; items: (InsertItem & { flat: number })[] }[] = [];
  filteredItems.value.forEach((item, flat) => {
    const group = groups.find((entry) => entry.label === item.group);
    const target = group ?? { label: item.group, items: [] };
    target.items.push({ ...item, flat });
    if (!group) groups.push(target);
  });
  return groups;
});

/* ------------------------------------------------------------------ */
/* 文档与插件                                                          */
/* ------------------------------------------------------------------ */

const placeholderPlugin = new Plugin({
  props: {
    decorations(state) {
      const items: Decoration[] = [];
      const walk = (parent: PMNode, base: number): void => {
        parent.forEach((node, offset) => {
          const from = base + offset;
          if (node.content.size === 0) {
            if (node.type.name === 'paragraph') {
              items.push(
                Decoration.node(from, from + node.nodeSize, { class: 'xiao-empty-block' }),
              );
            } else if (node.type.name === 'heading') {
              items.push(
                Decoration.node(from, from + node.nodeSize, {
                  class: 'xiao-empty-heading',
                  'data-level': String(node.attrs.level),
                }),
              );
            }
          }
          if (node.childCount) walk(node, from + 1);
        });
      };
      walk(state.doc, 0);
      return items.length ? DecorationSet.create(state.doc, items) : null;
    },
  },
});

function htmlBlockView(node: PMNode, editorView: EditorView, getPos: () => number | undefined): NodeView {
  const dom = document.createElement('div');
  dom.className = 'xiao-html-block';
  const inner = document.createElement('div');
  inner.className = 'xiao-html-block__inner';
  dom.appendChild(inner);
  let current = node;
  const render = (next: PMNode): void => {
    inner.innerHTML = String(next.attrs.html ?? '');
  };
  render(current);
  dom.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editorView.dispatch(
      editorView.state.tr.setSelection(NodeSelection.create(editorView.state.doc, pos)),
    );
  });
  return {
    dom,
    update(next) {
      if (next.type !== current.type) return false;
      current = next;
      render(next);
      return true;
    },
    ignoreMutation: () => true,
    stopEvent: () => true,
  };
}

function imageView(node: PMNode, editorView: EditorView, getPos: () => number | undefined): NodeView {
  const figure = document.createElement('figure');
  const img = document.createElement('img');
  const caption = document.createElement('figcaption');
  figure.dataset.xiao = 'image';
  figure.contentEditable = 'false';
  figure.append(img, caption);
  let current = node;
  const render = (next: PMNode): void => {
    figure.className = String(next.attrs.class || 'x-box');
    const src = String(next.attrs.src ?? '');
    const ratio = String(next.attrs.ratio ?? 'auto');
    figure.classList.toggle('is-empty', !src);
    if (src) img.src = imageDisplaySrc(src, props.siteDir, props.slug);
    else img.removeAttribute('src');
    img.alt = String(next.attrs.alt ?? '');
    img.className = [
      'x-media',
      ratio !== 'auto' ? `x-ratio-${ratio}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    caption.textContent = String(next.attrs.caption ?? '');
    caption.hidden = !next.attrs.caption;
  };
  render(current);
  figure.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editorView.dispatch(
      editorView.state.tr.setSelection(NodeSelection.create(editorView.state.doc, pos)),
    );
  });
  return {
    dom: figure,
    update(next) {
      if (next.type !== current.type) return false;
      current = next;
      render(next);
      return true;
    },
    ignoreMutation: () => true,
    stopEvent: () => true,
  };
}

function buildState(html: string): EditorState {
  return EditorState.create({
    doc: parseArticleHtml(html),
    plugins: [
      keymap({
        Enter: splitListItem(schema.nodes.list_item!),
        Tab: sinkListItem(schema.nodes.list_item!),
        'Shift-Tab': liftListItem(schema.nodes.list_item!),
        'Mod-z': undo,
        'Shift-Mod-z': redo,
        'Mod-y': redo,
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
        'Mod-Shift-x': toggleMark(schema.marks.strike),
        'Mod-e': toggleMark(schema.marks.code),
        'Mod-u': toggleMark(schema.marks.underline),
      }),
      keymap(baseKeymap),
      history(),
      gapCursor(),
      dropCursor({ color: '#6d9bff', width: 3 }),
      placeholderPlugin,
    ],
  });
}

function dispatchTransaction(tr: Transaction): void {
  if (!view) return;
  const next = view.state.apply(tr);
  view.updateState(next);
  if (tr.docChanged) {
    const text = view.state.doc.textBetween(0, view.state.doc.content.size, '\n', ' ');
    emit('change', text);
  }
  if (tr.docChanged || tr.selectionSet) emitSelection();
  refreshChrome();
  updateBubble();
  if (menu.open && menu.mode === 'slash') syncSlashQuery();
}

/* ------------------------------------------------------------------ */
/* 挂载                                                              */
/* ------------------------------------------------------------------ */

const FALLBACK_CSS = `
.xiao-surface{min-height:100%;background:#fff;color:#1e1e1e;font-family:system-ui,sans-serif}
.xiao-surface .article-editor__article{box-sizing:border-box;max-width:720px;margin:0 auto;padding:56px 32px 180px;min-height:100%}
.xiao-surface .ProseMirror{outline:none;min-height:calc(100vh - 240px)}
.xiao-surface .ProseMirror-selectednode{outline:2px solid #6d9bff;outline-offset:2px}
.xiao-surface .xiao-html-block{position:relative;margin:1em 0;padding:16px;border:1px dashed #c9ccd4;border-radius:8px}
.xiao-surface .xiao-html-block::before{content:'原始 HTML';position:absolute;top:-9px;left:10px;padding:0 6px;background:#fff;color:#666;font-size:11px}
.xiao-surface .xiao-html-block__inner{pointer-events:none}
.xiao-surface .ProseMirror p.xiao-empty-block::before{content:'输入内容，或按 / 选择区块';float:left;height:0;color:#999;pointer-events:none}
.xiao-surface .ProseMirror .xiao-empty-heading::before{content:'标题 ' attr(data-level);color:#999;opacity:.55;pointer-events:none}
.xiao-surface .ProseMirror figure.is-empty{display:grid;place-items:center;min-height:120px;border:1px dashed #c9ccd4;border-radius:10px;color:#888;background:#fafafa}
.xiao-surface .ProseMirror figure.is-empty img{display:none}
.xiao-surface .ProseMirror figure.is-empty::before{content:'选择图片';font-size:13px}
.xiao-surface .ProseMirror > a.x-button{margin:.6em 0}
.xiao-surface .ProseMirror [data-xiao='columns']{margin:1em 0}
.xiao-surface .ProseMirror [data-xiao-drop='before']{box-shadow:0 -3px 0 #6d9bff}
.xiao-surface .ProseMirror [data-xiao-drop='after']{box-shadow:0 3px 0 #6d9bff}
`;

async function mount(): Promise<void> {
  const host = hostEl.value;
  if (!host) return;
  const shadow = host.attachShadow({ mode: 'open' });
  styleEl = document.createElement('style');
  styleEl.textContent = FALLBACK_CSS;
  shadow.appendChild(styleEl);

  surface = document.createElement('div');
  surface.className = 'xiao-surface';
  surface.dataset.theme = 'auto';
  const article = document.createElement('article');
  article.className = 'prose article-editor__article';
  surface.appendChild(article);
  shadow.appendChild(surface);

  view = new EditorView(article, {
    state: buildState(props.html),
    dispatchTransaction,
    nodeViews: { html_block: htmlBlockView, image: imageView },
    attributes: { 'aria-label': '文章正文' },
  });
  view.dom.addEventListener('input', onViewInput);
  view.dom.addEventListener('click', onEditorClick);
  view.dom.addEventListener('keydown', onMenuKeydown, true);
  view.dom.addEventListener('paste', onPaste);
  view.dom.addEventListener('drop', onDrop);
  view.dom.addEventListener('mouseup', updateBubble);
  view.dom.addEventListener('keyup', updateBubble);
  view.focus();
  emitSelection(true);

  void loadSiteCss();
}

async function loadSiteCss(): Promise<void> {
  try {
    const result = await window.xiao.article.css(props.siteDir);
    if (!result.ok || !surface || !styleEl) return;
    styleEl.textContent = result.data.css;
    surface.dataset.theme = result.data.colorScheme;
  } catch {
    // 读不到站点样式时保留兜底样式，不挡编辑。
  }
}

onMounted(() => {
  void mount();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  view?.destroy();
  view = undefined;
});

/* ------------------------------------------------------------------ */
/* 块定位与工具条                                                       */
/* ------------------------------------------------------------------ */

function refreshChrome(): void {
  if (!view) return;
  if (hoverIndex.value === null) {
    hoverPos.value = null;
    return;
  }
  const range = blockAtIndex(view.state.doc, hoverIndex.value);
  if (!range) {
    hoverIndex.value = null;
    hoverPos.value = null;
    return;
  }
  const dom = view.nodeDOM(range.from);
  if (!(dom instanceof HTMLElement)) {
    hoverPos.value = null;
    return;
  }
  const rect = dom.getBoundingClientRect();
  const top = rect.top > 110 ? rect.top - 44 : rect.bottom + 10;
  hoverLabel.value = blockLabel(range.node);
  hoverIsHtml.value = range.node.type.name === 'html_block';
  hoverPos.value = {
    top: Math.max(56, Math.min(top, window.innerHeight - 60)),
    left: Math.max(12, Math.min(rect.left, window.innerWidth - 460)),
  };
}

function onPointerMove(event: PointerEvent): void {
  if (!view || menu.open) return;
  const target = event.target as Element | null;
  if (target?.closest?.('.block-toolbar, .slash-menu, .inline-bubble, .append-pill')) return;
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) {
    hoverIndex.value = null;
    hoverPos.value = null;
    return;
  }
  const index = blockIndexAt(view.state.doc, hit.pos);
  hoverIndex.value = index;
  refreshChrome();
}

function onPointerLeave(): void {
  if (menu.open || link.open) return;
  hoverIndex.value = null;
  hoverPos.value = null;
}

/* ------------------------------------------------------------------ */
/* 块操作                                                            */
/* ------------------------------------------------------------------ */

function moveBlock(delta: number): void {
  if (!view || hoverIndex.value === null) return;
  const index = hoverIndex.value;
  const range = blockAtIndex(view.state.doc, index);
  const other = blockAtIndex(view.state.doc, index + delta);
  if (!range || !other) return;
  const dest = delta < 0 ? other.from : other.to - range.node.nodeSize;
  const tr = view.state.tr.delete(range.from, range.to).insert(dest, range.node);
  view.dispatch(tr.scrollIntoView());
  hoverIndex.value = index + delta;
  refreshChrome();
}

function duplicateBlock(): void {
  if (!view || hoverIndex.value === null) return;
  const range = blockAtIndex(view.state.doc, hoverIndex.value);
  if (!range) return;
  const copy = range.node.copy(range.node.content);
  const tr = view.state.tr.insert(range.to, copy);
  view.dispatch(tr.scrollIntoView());
  hoverIndex.value = range.index + 1;
  refreshChrome();
}

function deleteBlock(): void {
  if (!view || hoverIndex.value === null) return;
  const range = blockAtIndex(view.state.doc, hoverIndex.value);
  if (!range) return;
  let tr = view.state.tr.delete(range.from, range.to);
  if (tr.doc.childCount === 0) tr = tr.insert(0, paragraph());
  view.dispatch(tr.scrollIntoView());
  hoverIndex.value = blockAtIndex(tr.doc, range.index) ? range.index : null;
  refreshChrome();
}

function openRaw(): void {
  if (!view || hoverIndex.value === null) return;
  const range = blockAtIndex(view.state.doc, hoverIndex.value);
  if (!range || range.node.type.name !== 'html_block') return;
  raw.from = range.from;
  raw.value = String(range.node.attrs.html ?? '');
  raw.open = true;
}

function applyRaw(): void {
  if (!view || raw.from < 0) return;
  const tr = view.state.tr.setNodeMarkup(raw.from, undefined, { html: raw.value });
  view.dispatch(tr);
  raw.open = false;
  refreshChrome();
}

/* ------------------------------------------------------------------ */
/* 插入                                                              */
/* ------------------------------------------------------------------ */

function openMenu(mode: 'slash' | 'append', target: number, x: number, y: number): void {
  menu.open = true;
  menu.mode = mode;
  menu.target = target;
  menu.index = 0;
  menu.query = '';
  menu.x = Math.max(12, Math.min(x, window.innerWidth - 340));
  menu.y = Math.max(56, Math.min(y, window.innerHeight - 420));
  link.open = false;
  hoverPos.value = null;
  nextTick(() => menuInput.value?.focus());
}

function openAppendMenu(event: MouseEvent): void {
  if (!view) return;
  openMenu('append', view.state.doc.childCount, event.clientX, event.clientY);
}

function openInsertAfter(): void {
  if (hoverIndex.value === null || !hoverPos.value) return;
  const index = hoverIndex.value + 1;
  const point = hoverPos.value;
  openMenu('append', index, point.left + 6, point.top + 42);
}

function onScroll(): void {
  refreshChrome();
  if (bubble.value) updateBubble();
}

function closeMenu(): void {
  if (!menu.open) return;
  if (menu.mode === 'slash') stripSlash();
  menu.open = false;
}

function stripSlash(): void {
  if (!view) return;
  const range = blockAtIndex(view.state.doc, menu.target);
  if (!range || !range.node.isTextblock) return;
  const text = range.node.textContent;
  if (!text.startsWith('/')) return;
  const tr = view.state.tr.delete(range.from + 1, range.from + 1 + text.length);
  if (tr.docChanged) view.dispatch(tr);
}

function choose(item: InsertItem): void {
  if (!view) return;
  const mode = menu.mode;
  const target = menu.target;
  if (item.key === 'image') {
    pendingImage.value = { mode, target };
    if (mode === 'slash') stripSlash();
    menu.open = false;
    fileInput.value?.click();
    return;
  }
  const node = item.make();
  if (!node) return;
  menu.open = false;
  if (mode === 'slash') replaceBlock(target, node);
  else insertBlock(target, node);
  if (item.key === 'raw') {
    nextTick(() => {
      if (!view) return;
      const index = Math.min(target, view.state.doc.childCount - 1);
      const range = blockAtIndex(view.state.doc, index);
      if (range?.node.type.name === 'html_block') {
        raw.from = range.from;
        raw.value = String(range.node.attrs.html ?? '');
        raw.open = true;
      }
    });
  }
}

function replaceBlock(index: number, node: PMNode): void {
  if (!view) return;
  const range = blockAtIndex(view.state.doc, index);
  if (!range) return;
  let tr = view.state.tr.replaceRangeWith(range.from, range.to, node);
  if (needsTrailingParagraph(node)) tr = tr.insert(range.from + node.nodeSize, paragraph());
  view.dispatch(tr.scrollIntoView());
  placeCursorIn(view, node.isAtom ? range.from + node.nodeSize : range.from);
  view.focus();
  hoverIndex.value = index;
  refreshChrome();
}

function insertBlock(index: number, node: PMNode): void {
  if (!view) return;
  const doc = view.state.doc;
  const clamped = Math.max(0, Math.min(index, doc.childCount));
  const pos = clamped >= doc.childCount ? doc.content.size : (blockAtIndex(doc, clamped)?.from ?? doc.content.size);
  let tr = view.state.tr.insert(pos, node);
  if (needsTrailingParagraph(node)) tr = tr.insert(pos + node.nodeSize, paragraph());
  view.dispatch(tr.scrollIntoView());
  placeCursorIn(view, node.isAtom ? pos + node.nodeSize : pos);
  view.focus();
  hoverIndex.value = clamped;
  refreshChrome();
}

function insertAtSelection(node: PMNode): void {
  if (!view) return;
  const index = blockIndexAt(view.state.doc, view.state.selection.from);
  insertBlock(index === null ? view.state.doc.childCount : index + 1, node);
}

/* ------------------------------------------------------------------ */
/* 斜杠菜单                                                          */
/* ------------------------------------------------------------------ */

function onViewInput(): void {
  // ProseMirror 在 MutationObserver 回调里才更新文档，input 事件这一刻 state 还是旧的。
  window.setTimeout(maybeOpenSlash, 0);
}

function maybeOpenSlash(): void {
  if (!view || menu.open) return;
  const state = view.state;
  const $from = state.selection.$from;
  if ($from.depth !== 1) return;
  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
  // 只在「这一块只有一个 /」时打开：否则替换整块会吞掉后面的正文。
  if (text !== '/' || $from.parent.content.size !== 1) return;
  const index = blockIndexAt(state.doc, $from.before(1));
  if (index === null) return;
  const coords = view.coordsAtPos(state.selection.from);
  openMenu('slash', index, coords.left, coords.bottom + 8);
}

function syncSlashQuery(): void {
  if (!view || !menu.open || menu.mode !== 'slash') return;
  const range = blockAtIndex(view.state.doc, menu.target);
  if (!range || !range.node.isTextblock) {
    menu.open = false;
    return;
  }
  const text = range.node.textContent;
  if (!text.startsWith('/')) {
    menu.open = false;
    return;
  }
  menu.query = text.slice(1);
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (!menu.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const count = filteredItems.value.length;
    if (!count) return;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    menu.index = (menu.index + step + count) % count;
    return;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    const item = filteredItems.value[menu.index];
    if (item) choose(item);
  }
}

function onMenuInputKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const count = filteredItems.value.length;
    if (!count) return;
    const step = event.key === 'ArrowDown' ? 1 : -1;
    menu.index = (menu.index + step + count) % count;
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const item = filteredItems.value[menu.index];
    if (item) choose(item);
  }
}

watch(
  () => menu.query,
  () => {
    menu.index = 0;
  },
);

watch(
  () => menu.open,
  (open) => {
    if (open) document.addEventListener('pointerdown', onDocumentPointerDown, true);
    else document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  },
);

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as Element | null;
  if (target?.closest?.('.slash-menu')) return;
  closeMenu();
}

/* ------------------------------------------------------------------ */
/* 行内格式气泡                                                        */
/* ------------------------------------------------------------------ */

function updateBubble(): void {
  if (!view) return;
  const { from, to, empty } = view.state.selection;
  if (empty) {
    bubble.value = null;
    link.open = false;
    return;
  }
  const start = view.coordsAtPos(from);
  bubble.value = {
    top: Math.max(54, start.top - 46),
    left: Math.max(12, Math.min(start.left, window.innerWidth - 380)),
  };
  const doc = view.state.doc;
  bubbleMarks.strong = doc.rangeHasMark(from, to, schema.marks.strong);
  bubbleMarks.em = doc.rangeHasMark(from, to, schema.marks.em);
  bubbleMarks.strike = doc.rangeHasMark(from, to, schema.marks.strike);
  bubbleMarks.code = doc.rangeHasMark(from, to, schema.marks.code);
  bubbleMarks.link = doc.rangeHasMark(from, to, schema.marks.link);
}

function mark(name: 'strong' | 'em' | 'strike' | 'code'): void {
  if (!view) return;
  const command = toggleMark(schema.marks[name]);
  command(view.state, view.dispatch);
  view.focus();
  updateBubble();
}

function toggleLink(): void {
  if (!view) return;
  link.open = !link.open;
  if (!link.open) return;
  link.value = currentLink();
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.link-input');
    input?.focus();
  });
}

function currentLink(): string {
  if (!view) return '';
  const { from, to, empty } = view.state.selection;
  if (empty) {
    const mark = schema.marks.link.isInSet(view.state.storedMarks ?? []);
    return mark ? String(mark.attrs.href) : '';
  }
  let href = '';
  view.state.doc.nodesBetween(from, to, (node) => {
    if (href) return;
    const found = schema.marks.link.isInSet(node.marks);
    if (found) href = String(found.attrs.href);
  });
  return href;
}

function applyLink(): void {
  if (!view) return;
  const { from, to } = view.state.selection;
  const href = link.value.trim();
  const linkMark = schema.marks.link;
  const tr = href
    ? view.state.tr.removeMark(from, to, linkMark).addMark(from, to, linkMark.create({ href }))
    : view.state.tr.removeMark(from, to, linkMark);
  view.dispatch(tr);
  link.open = false;
  view.focus();
  updateBubble();
}

/* ------------------------------------------------------------------ */
/* 图片                                                              */
/* ------------------------------------------------------------------ */

async function insertImageFile(file: File): Promise<void> {
  if (!view || uploading.value) return;
  uploading.value = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    bytes.forEach((item) => {
      binary += String.fromCharCode(item);
    });
    const saved = await window.xiao.content.saveImage(
      props.siteDir,
      props.slug,
      file.name,
      btoa(binary),
    );
    if (!saved.ok) {
      notify(`图片没能保存：${saved.message}。确认文章目录可写后重试。`, 'error', 'html-image');
      return;
    }
    const node = imageNode(saved.data, file.name.replace(/\.[^.]+$/, ''), '');
    const pending = pendingImage.value;
    pendingImage.value = null;
    if (pending) {
      if (pending.mode === 'slash') replaceBlock(pending.target, node);
      else insertBlock(pending.target, node);
    } else {
      insertAtSelection(node);
    }
  } finally {
    uploading.value = false;
  }
}

function onFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void insertImageFile(file);
}

function onPaste(event: ClipboardEvent): void {
  const files = Array.from(event.clipboardData?.files ?? []);
  const image = files.find((file) => file.type.startsWith('image/'));
  if (!image) return;
  event.preventDefault();
  void insertImageFile(image);
}

function onDrop(event: DragEvent): void {
  const files = Array.from(event.dataTransfer?.files ?? []);
  const image = files.find((file) => file.type.startsWith('image/'));
  if (!image) return;
  event.preventDefault();
  void insertImageFile(image);
}

/* ------------------------------------------------------------------ */
/* 拖拽排序                                                          */
/* ------------------------------------------------------------------ */

interface DragState {
  index: number;
  startX: number;
  startY: number;
  active: boolean;
  target: number | null;
  after: boolean;
}

let dragState: DragState | null = null;

function clearDropMarks(): void {
  surface
    ?.querySelectorAll('[data-xiao-drop]')
    .forEach((element) => element.removeAttribute('data-xiao-drop'));
}

function startBlockDrag(event: PointerEvent): void {
  if (!view || hoverIndex.value === null) return;
  event.preventDefault();
  event.stopPropagation();
  dragState = {
    index: hoverIndex.value,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
    target: null,
    after: false,
  };
  window.addEventListener('pointermove', onBlockDragMove);
  window.addEventListener('pointerup', onBlockDragEnd, { once: true });
}

function onBlockDragMove(event: PointerEvent): void {
  if (!view || !dragState) return;
  if (!dragState.active) {
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 4) return;
    dragState.active = true;
  }
  clearDropMarks();
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return;
  const index = blockIndexAt(view.state.doc, hit.pos);
  if (index === null || index === dragState.index) return;
  const range = blockAtIndex(view.state.doc, index);
  if (!range) return;
  const dom = view.nodeDOM(range.from);
  if (!(dom instanceof HTMLElement)) return;
  const rect = dom.getBoundingClientRect();
  dragState.target = index;
  dragState.after = event.clientY > rect.top + rect.height / 2;
  dom.setAttribute('data-xiao-drop', dragState.after ? 'after' : 'before');
}

function onBlockDragEnd(): void {
  window.removeEventListener('pointermove', onBlockDragMove);
  const state = dragState;
  dragState = null;
  clearDropMarks();
  if (!state?.active || !view || state.target === null) return;
  const source = blockAtIndex(view.state.doc, state.index);
  const target = blockAtIndex(view.state.doc, state.target);
  if (!source || !target) return;
  let dest = state.after ? target.to : target.from;
  if (dest > source.from) dest -= source.node.nodeSize;
  const tr = view.state.tr.delete(source.from, source.to).insert(dest, source.node);
  view.dispatch(tr.scrollIntoView());
  hoverIndex.value = state.target > state.index ? state.target - 1 : state.target;
  refreshChrome();
}

/* ------------------------------------------------------------------ */
/* 对外                                                              */
/* ------------------------------------------------------------------ */

let lastSelectionKey = '';

function selectionIndex(): number | null {
  if (!view) return null;
  return blockIndexAt(view.state.doc, view.state.selection.from);
}

function infoAt(index: number): HtmlBlockInfo | null {
  if (!view) return null;
  const range = blockAtIndex(view.state.doc, index);
  if (!range) return null;
  const type = range.node.type.name;
  const attrs: Record<string, string | number> = {};
  for (const key of ['src', 'alt', 'caption', 'ratio', 'href', 'type']) {
    const value = range.node.attrs[key];
    if (value !== undefined && value !== null && value !== '') attrs[key] = String(value);
  }
  return {
    index,
    type,
    label: blockLabel(range.node),
    classes: splitClasses(range.node.attrs.class),
    attrs,
    text: range.node.textContent,
    canStyle: STYLEABLE_TYPES.has(type),
    canColumns: ['callout', 'card', 'columns'].includes(type),
    isText: TEXT_TYPES.has(type),
    isImage: type === 'image',
    isButton: type === 'button',
    isCallout: type === 'callout',
    isColumns: type === 'columns',
  };
}

function emitSelection(force = false): void {
  if (!view) {
    emit('select', null);
    return;
  }
  const index = selectionIndex();
  if (index === null) {
    emit('select', null);
    return;
  }
  const info = infoAt(index);
  if (!info) {
    emit('select', null);
    return;
  }
  const key = JSON.stringify([info.type, info.classes, info.attrs, info.isColumns ? info.text : '']);
  if (!force && key === lastSelectionKey) return;
  lastSelectionKey = key;
  emit('select', info);
}

function setBlockClasses(classes: string[]): void {
  if (!view) return;
  const index = selectionIndex();
  if (index === null) return;
  const range = blockAtIndex(view.state.doc, index);
  if (!range || !('class' in range.node.attrs)) return;
  const value = [...new Set(classes)].join(' ').trim();
  if (String(range.node.attrs.class ?? '') === value) return;
  view.dispatch(
    view.state.tr.setNodeMarkup(range.from, undefined, {
      ...range.node.attrs,
      class: value,
    }),
  );
  view.focus();
  emitSelection(true);
}

function setBlockAttrs(patch: Record<string, string | number>): void {
  if (!view) return;
  const index = selectionIndex();
  if (index === null) return;
  const range = blockAtIndex(view.state.doc, index);
  if (!range) return;
  const next = { ...range.node.attrs };
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in next)) continue;
    if (next[key] === value) continue;
    next[key] = value;
    changed = true;
  }
  if (!changed) return;
  view.dispatch(view.state.tr.setNodeMarkup(range.from, undefined, next));
  view.focus();
  emitSelection(true);
}

function onEditorClick(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('a')) event.preventDefault();
}

function getHtml(): string {
  return view ? serializeArticle(view.state.doc) : '';
}

defineExpose({ getHtml, setBlockClasses, setBlockAttrs });
</script>

<template>
  <div
    class="html-article"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @scroll.capture="onScroll"
  >
    <div ref="scrollEl" class="html-article__scroll">
      <div ref="hostEl" class="html-article__host" />
      <div class="html-article__append">
        <button type="button" class="append-pill" @click="openAppendMenu">
          <UiIcon :path="mdiPlus" :size="15" />
          <span>添加区块</span>
        </button>
      </div>
    </div>

    <div
      v-if="hoverPos && hoverIndex !== null"
      class="block-toolbar"
      :style="{ top: `${hoverPos.top}px`, left: `${hoverPos.left}px` }"
      @pointerdown.stop
    >
      <button type="button" class="grip" title="拖动排序" @pointerdown="startBlockDrag">
        <UiIcon :path="mdiDragVertical" :size="16" />
      </button>
      <span class="block-name">{{ hoverLabel }}</span>
      <button type="button" title="在后面插入区块" @click="openInsertAfter">
        <UiIcon :path="mdiPlus" :size="15" />
      </button>
      <button type="button" title="上移" @click="moveBlock(-1)">
        <UiIcon :path="mdiArrowUp" :size="15" />
      </button>
      <button type="button" title="下移" @click="moveBlock(1)">
        <UiIcon :path="mdiArrowDown" :size="15" />
      </button>
      <button type="button" title="复制" @click="duplicateBlock">
        <UiIcon :path="mdiContentCopy" :size="15" />
      </button>
      <button v-if="hoverIsHtml" type="button" title="编辑这一块的 HTML" @click="openRaw">
        <UiIcon :path="mdiCodeTags" :size="15" />
      </button>
      <button type="button" class="danger" title="删除" @click="deleteBlock">
        <UiIcon :path="mdiDeleteOutline" :size="15" />
      </button>
    </div>

    <div
      v-if="bubble && !menu.open"
      class="inline-bubble"
      :style="{ top: `${bubble.top}px`, left: `${bubble.left}px` }"
    >
      <button type="button" :class="{ on: bubbleMarks.strong }" title="加粗" @click="mark('strong')">
        <UiIcon :path="mdiFormatBold" :size="15" />
      </button>
      <button type="button" :class="{ on: bubbleMarks.em }" title="斜体" @click="mark('em')">
        <UiIcon :path="mdiFormatItalic" :size="15" />
      </button>
      <button
        type="button"
        :class="{ on: bubbleMarks.strike }"
        title="删除线"
        @click="mark('strike')"
      >
        <UiIcon :path="mdiFormatStrikethroughVariant" :size="15" />
      </button>
      <button type="button" :class="{ on: bubbleMarks.code }" title="行内代码" @click="mark('code')">
        <UiIcon :path="mdiCodeTags" :size="15" />
      </button>
      <span class="bubble-sep" />
      <button type="button" :class="{ on: bubbleMarks.link || link.open }" title="链接" @click="toggleLink">
        <UiIcon :path="mdiLinkVariant" :size="15" />
      </button>
      <template v-if="link.open">
        <input
          v-model="link.value"
          class="link-input"
          placeholder="https://"
          @keydown.enter.prevent="applyLink"
          @keydown.esc.prevent="link.open = false"
        />
        <button type="button" class="link-apply" @click="applyLink">确定</button>
      </template>
    </div>

    <div
      v-if="menu.open"
      class="slash-menu"
      :style="{ top: `${menu.y}px`, left: `${menu.x}px` }"
      @pointerdown.stop
    >
      <input
        ref="menuInput"
        v-model="menu.query"
        class="slash-search"
        placeholder="搜索区块"
        aria-label="搜索区块"
        @keydown="onMenuInputKey"
      />
      <div class="slash-list">
        <template v-for="group in filteredGroups" :key="group.label">
          <p class="slash-group">{{ group.label }}</p>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            class="slash-item"
            :class="{ on: item.flat === menu.index }"
            @click="choose(item)"
            @mouseenter="menu.index = item.flat"
          >
            <UiIcon :path="item.icon" :size="16" />
            <span>{{ item.label }}</span>
            <span class="slash-hint">{{ item.hint }}</span>
          </button>
        </template>
        <p v-if="filteredItems.length === 0" class="slash-empty">没有匹配的区块</p>
      </div>
    </div>

    <div v-if="uploading" class="uploading">
      <UiSpinner :size="13" />
      <span>正在保存图片…</span>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="file-input"
      @change="onFilePicked"
    />

    <UiDialog v-model="raw.open" title="编辑这一块的原始 HTML" :width="720">
      <p class="raw-hint">
        认不出的结构会整块保留。改完写回正文，外观以站点样式为准。
      </p>
      <textarea v-model="raw.value" class="raw-input" spellcheck="false" aria-label="原始 HTML" />
      <template #actions>
        <UiButton size="sm" @click="raw.open = false">取消</UiButton>
        <UiButton variant="primary" size="sm" @click="applyRaw">保存这一块</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.html-article {
  position: relative;
  height: 100%;
  min-height: 0;
  background: var(--ui-bg);
}

.html-article__scroll {
  height: 100%;
  overflow: auto;
  background: var(--ui-bg);
}

.html-article__host {
  display: block;
  min-height: calc(100% - 96px);
  margin: 0 auto;
  box-shadow: 0 0 0 1px var(--ui-line);
}

.html-article__append {
  display: flex;
  justify-content: center;
  padding: var(--ui-s4) 0 var(--ui-s7);
}

.append-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  height: 30px;
  padding: 0 var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-pill, 999px);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  cursor: pointer;
}

.append-pill:hover {
  border-color: var(--ui-line-2);
  color: var(--ui-text);
}

.block-toolbar {
  position: fixed;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 1px;
  height: 34px;
  padding: 0 4px;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
  box-shadow: 0 6px 18px rgb(0 0 0 / 30%);
}

.block-toolbar button {
  display: grid;
  width: 28px;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  cursor: pointer;
}

.block-toolbar button:hover {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.block-toolbar .grip {
  cursor: grab;
}

.block-toolbar .danger:hover {
  background: var(--ui-danger-weak);
  color: var(--ui-danger);
}

.block-name {
  padding: 0 var(--ui-s2) 0 var(--ui-s1);
  color: var(--ui-text-3);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
  white-space: nowrap;
}

.inline-bubble {
  position: fixed;
  z-index: 32;
  display: flex;
  align-items: center;
  gap: 1px;
  height: 34px;
  padding: 0 4px;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
  box-shadow: 0 6px 18px rgb(0 0 0 / 30%);
}

.inline-bubble button {
  display: grid;
  width: 28px;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  cursor: pointer;
}

.inline-bubble button:hover,
.inline-bubble button.on {
  background: var(--ui-active);
  color: var(--ui-text);
}

.bubble-sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--ui-line-2);
}

.link-input {
  width: 200px;
  height: 26px;
  margin-left: var(--ui-s1);
  padding: 0 var(--ui-s2);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  outline: none;
}

.link-apply {
  width: auto !important;
  padding: 0 var(--ui-s2);
  color: var(--ui-accent) !important;
  font-size: var(--ui-fs-2);
}

.slash-menu {
  position: fixed;
  z-index: 34;
  width: 320px;
  max-height: 380px;
  padding: var(--ui-s2);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
  box-shadow: 0 16px 40px rgb(0 0 0 / 40%);
}

.slash-search {
  width: 100%;
  height: 32px;
  margin-bottom: var(--ui-s2);
  padding: 0 var(--ui-s2);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  outline: none;
}

.slash-list {
  max-height: 320px;
  overflow: auto;
}

.slash-group {
  margin: var(--ui-s2) 0 var(--ui-s1);
  padding: 0 var(--ui-s2);
  color: var(--ui-text-3);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
}

.slash-item {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
  height: 34px;
  padding: 0 var(--ui-s2);
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  text-align: left;
  cursor: pointer;
}

.slash-item.on,
.slash-item:hover {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.slash-hint {
  margin-left: auto;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.slash-empty {
  margin: 0;
  padding: var(--ui-s3);
  color: var(--ui-text-3);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
}

.uploading {
  position: fixed;
  right: var(--ui-s5);
  bottom: var(--ui-s7);
  z-index: 35;
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
}

.file-input {
  display: none;
}

.raw-hint {
  margin: 0 0 var(--ui-s2);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.raw-input {
  width: 100%;
  min-height: 260px;
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font-family: var(--ui-mono, monospace);
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

@media (max-width: 900px) {
  .html-article__host {
    box-shadow: none;
  }
}
</style>
