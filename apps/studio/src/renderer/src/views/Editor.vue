<script setup lang="ts">
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame-dark.css';
import type { IpcResult } from '@xiao/core/ipc';
import {
  markDirty,
  openMarkdown,
  saveMarkdown,
  type MarkdownSession,
  type SaveResult,
} from '@xiao/core/markdown';
import * as monaco from 'monaco-editor';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import '../../../../../../packages/template/src/styles/xiao.css';
import { breakpointCss } from '../../../../../../packages/template/src/lib/breakpoints.ts';
import {
  ALIGN_OPTIONS,
  applyXiaoHtml,
  ASTRO_BLOCKS,
  ASTRO_CATEGORY_LABEL,
  ASTRO_CATEGORY_ORDER,
  attachHtmlNodeViews,
  BG_OPTIONS,
  BORDER_OPTIONS,
  breakpointsDesc,
  clearHtmlSelection,
  COLOR_OPTIONS,
  COL_OPTIONS,
  DEFAULT_BREAKPOINTS,
  DIR_OPTIONS,
  dropPosition,
  EMPTY_STYLE,
  HEADING_OPTIONS,
  hasStyleField,
  hideOptions,
  INHERIT_OPTION,
  insertXiaoBlock,
  insertXiaoBlockAt,
  JUSTIFY_OPTIONS,
  parseXiaoHtml,
  RADIUS_OPTIONS,
  registerAstroSlashGroups,
  resolveBreakpoints,
  setBreakpoints,
  setCanvasScale,
  setHtmlPickHandler,
  SHADOW_OPTIONS,
  SPACE_OPTIONS,
  TALIGN_OPTIONS,
  TEXT_OPTIONS,
  textSlotLabel,
  tokensFor,
  TYPE_OPTIONS,
  WEIGHT_OPTIONS,
  WIDTH_OPTIONS,
  writeHtmlNode,
  type AstroBlock,
  type AstroBlockCategory,
  type Breakpoint,
  type StyleBreakpoint,
  type XiaoBlockPatch,
  type XiaoBlockState,
  type XiaoStyleTokens,
} from '../astro-blocks.ts';
import { copy } from '../copy.ts';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
  UiEmpty,
  UiField,
  UiIcon,
  UiInput,
  UiSegmented,
  UiSelect,
  UiSpinner,
  UiSwitch,
  UiTextarea,
  UiTooltip,
} from '../ui/index.ts';

// Monaco 的 worker 由 Vite 打包成独立模块；沿用旧实现的写法，不要改成默认 CDN 路径。
self.MonacoEnvironment = {
  getWorker: () =>
    new Worker(new URL('../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
      type: 'module',
    }),
};

const props = defineProps<{ siteDir: string; slug: string }>();

const sessionStore = useSession();

type ViewState = 'loading' | 'ready' | 'empty' | 'error';
type FieldKey = 'title' | 'category' | 'summary' | 'draft';

interface FieldSnapshot {
  title: string;
  category: string;
  description: string;
  draft: boolean;
}

const crepeRoot = ref<HTMLElement | null>(null);
const sourceRoot = ref<HTMLElement | null>(null);
const bodyElement = ref<HTMLElement | null>(null);
const viewState = ref<ViewState>('loading');
const loadError = ref('');
const errorKind = ref<'read' | 'mount'>('read');
const sourceMode = ref(false);
const inspectorHost = ref(false);

const title = ref('');
const category = ref('');
const summary = ref('');
const draft = ref(false);
const categoryList = ref<string[]>([]);
/** 检查器里展示的 slug；跟着已加载的文章走，而不是跟着可能已经变了的 props。 */
const currentSlug = ref(props.slug);
/** frontmatter 里用 `>` / `|` 多行写法的字段不能在表单里改，否则会把 YAML 改坏。 */
const blockedFields = ref<FieldKey[]>([]);
const summaryKey = ref<'description' | 'summary'>('description');
const hasFrontmatter = ref(false);
const charCount = ref(0);
const selectedBlock = ref<XiaoBlockState | null>(null);
const paletteSearch = ref('');
const collapsedListForEditor = ref(false);
const styleBp = ref<StyleBreakpoint>('base');
const dragGhost = ref<{ label: string; x: number; y: number } | null>(null);
const dropHint = ref('');

/** 站点断点表（来自 xiao.config.json 的 theme.breakpoints；没有则用默认 md/sm）。 */
const breakpoints = ref<Breakpoint[]>(
  DEFAULT_BREAKPOINTS.map((bp) => ({ ...bp })).sort((left, right) => left.maxWidth - right.maxWidth),
);
const artboardEl = ref<HTMLElement | null>(null);
const frameEl = ref<HTMLElement | null>(null);
const zoom = ref(1);
const zoomMode = ref<'fit' | 'manual'>('fit');
const panX = ref(24);
const panY = ref(24);
const spaceHeld = ref(false);
const panning = ref(false);
const hoveringCanvas = ref(false);

let dragArmed: { x: number; y: number; block: AstroBlock } | null = null;
let dragBlock: AstroBlock | null = null;
let skipPaletteClick = false;
let breakpointsSite = '';
let breakpointsAt = 0;
let artboardObserver: ResizeObserver | undefined;
let frameObserver: ResizeObserver | undefined;
let layoutFrame = 0;
let panOrigin = { x: 0, y: 0, panX: 0, panY: 0 };

const CANVAS_PAD = 24;
const MIN_MANUAL_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 2;

/** 设备按钮决定画布框宽：电脑 1280、平板=最宽断点、手机=最窄断点。 */
const frameWidth = computed(() => {
  const device = sessionStore.previewDevice;
  if (device === 'phone') return breakpoints.value[0]?.maxWidth ?? 767;
  if (device === 'tablet') {
    const sorted = breakpointsDesc(breakpoints.value);
    return sorted[0]?.maxWidth ?? 1023;
  }
  return 1280;
});

const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`);

const stageStyle = computed(() => ({
  transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoom.value})`,
}));

/**
 * 画布预览断点样式：模板生成的 CSS 是 @media（按窗口宽），画板里换成 @container，
 * 让 `.frame` 的宽度决定命中哪一档。选择器再补上 `.frame .xiao-html` 前缀，
 * 保证断点覆盖能压过画板里给组件块兜底的样式（同特异性时后注入的生效）。
 */
const canvasCss = computed(() =>
  breakpointCss(breakpoints.value)
    .replace(/@media/g, '@container')
    .replace(/\.x-([a-z0-9-]+)/g, '.frame .xiao-html .x-$1'),
);

const paletteGroups = computed(() => {
  const query = paletteSearch.value.trim().toLowerCase();
  return ASTRO_CATEGORY_ORDER.map((category) => ({
    category,
    label: ASTRO_CATEGORY_LABEL[category],
    items: ASTRO_BLOCKS.filter(
      (item) =>
        item.category === category &&
        (!query || item.label.includes(query) || item.name.toLowerCase().includes(query)),
    ),
  })).filter((group) => group.items.length > 0);
});

const categoryIcon: Record<AstroBlockCategory, string> = {
  structure: icons.pages,
  container: icons.files,
  content: icons.edit,
  blog: icons.posts,
  embed: icons.image,
};

let session: MarkdownSession | undefined;
/** 当前 session 对应的文章身份。props 可能在 flush 之前就变了，写盘必须用这对值。 */
let activeSiteDir = '';
let activeSlug = '';
let crepe: Crepe | undefined;
let crepeReady = false;
let sourceEditor: monaco.editor.IStandaloneCodeEditor | undefined;
let sourceModel: monaco.editor.ITextModel | undefined;
let baseline: FieldSnapshot = { title: '', category: '', description: '', draft: false };
let syncingFields = false;
/** 源码模式打开时的初始文本；用来判断用户是否真的改过源码。 */
let sourceInitial = '';
/** 切到源码后、Monaco 还没创建完的那一刻，保存要用的正文。 */
let pendingSourceText = '';
/** 源码切回所见即所得、Crepe 还没挂载完时暂存的正文，避免这个窗口里切文章丢内容。 */
let pendingVisualText = '';
/** 每次正文/属性变化都自增；保存回来时用它判断期间有没有新的编辑。 */
let editSeq = 0;
/** 正文是否被改过。只改属性时不要把 Crepe 序列化过的正文写回去。 */
let bodyEdited = false;
let saveTimer = 0;
let generation = 0;
let bodyRetries = 0;
let chain: Promise<void> = Promise.resolve();

const modeItems = [
  { key: 'visual', label: '编辑', icon: icons.edit },
  { key: 'source', label: '源码', icon: icons.code },
];

const modeKey = computed({
  get: () => (sourceMode.value ? 'source' : 'visual'),
  set: (value: string) => {
    if (value === 'source') void enterSource();
    else enterVisual();
  },
});

const saveTone = computed<'ok' | 'warn' | 'neutral' | 'danger'>(() => {
  switch (sessionStore.saveState) {
    case 'dirty':
      return 'warn';
    case 'saving':
      return 'neutral';
    case 'conflict':
      return 'danger';
    default:
      return 'ok';
  }
});

const saveText = computed(() => {
  switch (sessionStore.saveState) {
    case 'dirty':
      return copy.dirty;
    case 'saving':
      return copy.saving;
    case 'conflict':
      return copy.conflict;
    default:
      return copy.saved;
  }
});

const saveIcon = computed(() => {
  switch (sessionStore.saveState) {
    case 'dirty':
      return icons.edit;
    case 'saving':
      return icons.save;
    case 'conflict':
      return icons.alert;
    default:
      return icons.check;
  }
});

const fieldsEditable = computed(() => hasFrontmatter.value && viewState.value !== 'error');

const showEmptyHint = computed(() => viewState.value === 'empty' && !sourceMode.value);

const errorTitle = computed(() => (errorKind.value === 'mount' ? '编辑器没能加载' : '没能打开这篇'));

const errorHint = computed(() =>
  errorKind.value === 'mount'
    ? `${loadError.value}。点下面的按钮重新加载；正文还在文件里，也可以切到源码模式查看。`
    : `${loadError.value}。文件可能被移动或改名了；回到文章列表刷新后再试，或点下面的按钮重新加载。`,
);

const categoryOptions = computed<{ value: string; label: string }[]>(() => {
  const names = new Set(categoryList.value);
  if (category.value) names.add(category.value);
  const options = [{ value: '', label: '未分类' }];
  for (const name of [...names].sort((left, right) => left.localeCompare(right, 'zh-CN'))) {
    options.push({ value: name, label: name });
  }
  return options;
});

const sortedBps = computed(() => breakpointsDesc(breakpoints.value));

/** 检查器断点 tabs：电脑 + 各断点（宽 → 窄），前缀「样式：」避免和设备按钮混淆。 */
const bpItems = computed<{ key: string; label: string }[]>(() => [
  { key: 'base', label: '样式：电脑' },
  ...sortedBps.value.map((bp) => ({ key: bp.id, label: `样式：${bp.label}` })),
]);

const bpKey = computed({
  get: () => styleBp.value,
  set: (value: string) => setStyleBp(value as StyleBreakpoint),
});

const overrideCount = computed(() => {
  const block = selectedBlock.value;
  if (!block || styleBp.value === 'base') return 0;
  return Object.values(tokensFor(block, styleBp.value)).filter(Boolean).length;
});

const hideSelectOptions = computed<{ value: string; label: string }[]>(() => {
  const options = [{ value: '', label: '不隐藏' }, ...hideOptions(breakpoints.value)];
  const current = selectedBlock.value?.hide ?? '';
  if (current && !options.some((option) => option.value === current)) {
    // 老内容里的 x-hide-mobile / x-hide-tablet 没有丢，先保留原值。
    options.push({ value: current, label: `${current}（旧写法）` });
  }
  return options;
});

interface StyleFieldDef {
  key: keyof XiaoStyleTokens;
  label: string;
  options: { value: string; label: string }[];
  group: 'layout' | 'appearance';
}

const STYLE_FIELDS: StyleFieldDef[] = [
  { key: 'width', label: '宽度', options: WIDTH_OPTIONS, group: 'layout' },
  { key: 'pad', label: '内边距', options: SPACE_OPTIONS, group: 'layout' },
  { key: 'gap', label: '间距', options: SPACE_OPTIONS, group: 'layout' },
  { key: 'cols', label: '列数', options: COL_OPTIONS, group: 'layout' },
  { key: 'direction', label: '方向', options: DIR_OPTIONS, group: 'layout' },
  { key: 'align', label: '交叉轴对齐', options: ALIGN_OPTIONS, group: 'layout' },
  { key: 'justify', label: '主轴分布', options: JUSTIFY_OPTIONS, group: 'layout' },
  { key: 'talign', label: '文字对齐', options: TALIGN_OPTIONS, group: 'layout' },
  { key: 'bg', label: '填充', options: BG_OPTIONS, group: 'appearance' },
  { key: 'radius', label: '圆角', options: RADIUS_OPTIONS, group: 'appearance' },
  { key: 'shadow', label: '阴影', options: SHADOW_OPTIONS, group: 'appearance' },
  { key: 'border', label: '描边', options: BORDER_OPTIONS, group: 'appearance' },
  { key: 'text', label: '字号', options: TEXT_OPTIONS, group: 'appearance' },
  { key: 'weight', label: '字重', options: WEIGHT_OPTIONS, group: 'appearance' },
  { key: 'color', label: '文字色', options: COLOR_OPTIONS, group: 'appearance' },
];

const layoutStyleFields = computed(() => {
  const block = selectedBlock.value;
  if (!block) return [];
  return STYLE_FIELDS.filter((field) => field.group === 'layout' && hasStyleField(block, field.key));
});

const appearanceStyleFields = computed(() => {
  const block = selectedBlock.value;
  if (!block) return [];
  return STYLE_FIELDS.filter((field) => field.group === 'appearance' && hasStyleField(block, field.key));
});

function widestBreakpoint(): Breakpoint | undefined {
  return sortedBps.value[0];
}

function narrowestBreakpoint(): Breakpoint | undefined {
  return sortedBps.value[sortedBps.value.length - 1];
}

/** 断点 → 设备：电脑=base，平板=最宽断点，手机=最窄断点。 */
function deviceForBp(bp: StyleBreakpoint): 'pc' | 'tablet' | 'phone' | null {
  if (bp === 'base') return 'pc';
  const narrow = narrowestBreakpoint();
  if (narrow && narrow.id === bp) return 'phone';
  const wide = widestBreakpoint();
  if (wide && wide.id === bp) return 'tablet';
  return null;
}

/** 设备 → 断点：电脑=base，平板=最宽断点，手机=最窄断点。 */
function bpForDevice(device: string): StyleBreakpoint {
  if (device === 'tablet') return widestBreakpoint()?.id ?? 'md';
  if (device === 'phone') return narrowestBreakpoint()?.id ?? 'sm';
  return 'base';
}

function bpLabel(bp: StyleBreakpoint): string {
  if (bp === 'base') return '电脑';
  return breakpoints.value.find((item) => item.id === bp)?.label ?? bp;
}

function setStyleBp(bp: StyleBreakpoint): void {
  styleBp.value = bp;
  const device = deviceForBp(bp);
  if (device) sessionStore.setPreviewDevice(device);
  scheduleLayout();
}

function bpOptions<T extends { value: string; label: string }>(options: T[]): { value: string; label: string }[] {
  return styleBp.value === 'base' ? options : [INHERIT_OPTION, ...options];
}

function styleValue(field: keyof XiaoStyleTokens): string {
  const block = selectedBlock.value;
  return block ? tokensFor(block, styleBp.value)[field] : '';
}

function isOverridden(field: keyof XiaoStyleTokens): boolean {
  const block = selectedBlock.value;
  if (!block || styleBp.value === 'base') return false;
  return Boolean(tokensFor(block, styleBp.value)[field]);
}

function patchStyle(field: keyof XiaoStyleTokens, value: string): void {
  const current = selectedBlock.value;
  if (!current) return;
  const bp = styleBp.value;
  if (bp === 'base') {
    patchSelectedBlock({ base: { ...current.base, [field]: value } });
    return;
  }
  patchSelectedBlock({ breakpoints: { [bp]: { ...tokensFor(current, bp), [field]: value } } });
}

function clearStyle(field: keyof XiaoStyleTokens): void {
  patchStyle(field, '');
}

function clearBreakpointOverrides(): void {
  const current = selectedBlock.value;
  if (!current || styleBp.value === 'base') return;
  patchSelectedBlock({ breakpoints: { [styleBp.value]: { ...EMPTY_STYLE } } });
}

function paintDrop(target: ReturnType<typeof dropPosition>): void {
  document.querySelectorAll('.xiao-html.is-drop, .xiao-html.is-drop-before, .xiao-html.is-drop-after').forEach((el) => {
    el.classList.remove('is-drop', 'is-drop-before', 'is-drop-after');
  });
  if (!target || target.mode === 'doc') {
    dropHint.value = target ? '插入到此处' : '';
    return;
  }
  const host = [...(crepeRoot.value?.querySelectorAll('.xiao-html') ?? [])].find(
    (el) => Number((el as HTMLElement).dataset.pos) === target.htmlPos,
  );
  if (!(host instanceof HTMLElement)) return;
  if (target.mode === 'into') {
    host.classList.add('is-drop');
    dropHint.value = '放入容器内';
  } else if (target.mode === 'before') {
    host.classList.add('is-drop-before');
    dropHint.value = '插到这块前面';
  } else {
    host.classList.add('is-drop-after');
    dropHint.value = '插到这块后面';
  }
}

function onPickBlock(block: XiaoBlockState | null): void {
  selectedBlock.value = block;
  if (block && !sessionStore.inspectorOpen) sessionStore.inspectorOpen = true;
}

function insertBlock(block: AstroBlock, at: ReturnType<typeof dropPosition> = null): void {
  if (sourceMode.value || viewState.value !== 'ready') return;
  const ok = at ? insertXiaoBlockAt(block.snippet, at) : insertXiaoBlock(block.snippet);
  if (!ok) {
    notify('编辑器还没准备好，等正文出现后再插入。', 'error', 'editor-insert');
    return;
  }
  bodyEdited = true;
  touchEdits();
  void nextTick(() => {
    const nodes = crepeRoot.value?.querySelectorAll('.xiao-html');
    const last = nodes?.[nodes.length - 1]?.querySelector('.xiao-html__body');
    last?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
}

function onPalettePointerDown(event: PointerEvent, block: AstroBlock): void {
  if (event.button !== 0) return;
  dragArmed = { x: event.clientX, y: event.clientY, block };
}

function onWindowPointerMove(event: PointerEvent): void {
  if (!dragArmed && !dragBlock) return;
  if (dragArmed && !dragBlock) {
    const dx = event.clientX - dragArmed.x;
    const dy = event.clientY - dragArmed.y;
    if (dx * dx + dy * dy < 36) return;
    dragBlock = dragArmed.block;
    skipPaletteClick = true;
  }
  if (!dragBlock) return;
  dragGhost.value = { label: dragBlock.label, x: event.clientX, y: event.clientY };
  paintDrop(dropPosition(event.clientX, event.clientY));
}

function onWindowPointerUp(event: PointerEvent): void {
  const block = dragBlock;
  const at = block ? dropPosition(event.clientX, event.clientY) : null;
  dragArmed = null;
  dragBlock = null;
  dragGhost.value = null;
  dropHint.value = '';
  paintDrop(null);
  if (block) insertBlock(block, at);
}

function onPaletteClick(block: AstroBlock): void {
  if (skipPaletteClick) {
    skipPaletteClick = false;
    return;
  }
  insertBlock(block);
}

function patchSelectedBlock(patch: XiaoBlockPatch): void {
  const current = selectedBlock.value;
  if (!current || sourceMode.value) return;
  const html = applyXiaoHtml(current.html, patch);
  const written = writeHtmlNode(current.pos, html);
  if (written == null) return;
  selectedBlock.value = parseXiaoHtml(html, written);
  bodyEdited = true;
  touchEdits();
}

function setBlockText(index: number, value: string): void {
  const current = selectedBlock.value;
  if (!current) return;
  const texts = current.texts.slice();
  texts[index] = value;
  patchSelectedBlock({ texts });
}

function onCrepeMouseDown(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Element && target.closest('.xiao-html')) return;
  clearHtmlSelection();
}

/* ---------- 画布缩放 / 平移 ---------- */

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampZoom(value: number): number {
  return clampNumber(value, MIN_MANUAL_ZOOM, MAX_CANVAS_ZOOM);
}

/** 适应宽度：按画板可视宽度算缩放，允许小于 50%，但不放大超过 100%。 */
function fitZoom(): number {
  const element = artboardEl.value;
  if (!element) return 1;
  const width = Math.max(120, element.clientWidth - CANVAS_PAD * 2);
  return clampNumber(width / frameWidth.value, 0.25, 1);
}

/** 变换不改排版尺寸，所以平移只做边界限制，不做滚动。 */
function clampPan(): void {
  const element = artboardEl.value;
  if (!element) return;
  const width = element.clientWidth;
  const height = element.clientHeight;
  const scaledWidth = frameWidth.value * zoom.value;
  const scaledHeight = (frameEl.value?.offsetHeight ?? 0) * zoom.value;
  if (scaledWidth <= width - CANVAS_PAD * 2) {
    panX.value = (width - scaledWidth) / 2;
  } else {
    panX.value = clampNumber(panX.value, width - scaledWidth - CANVAS_PAD, CANVAS_PAD);
  }
  if (scaledHeight <= height - CANVAS_PAD * 2) {
    panY.value = CANVAS_PAD;
  } else {
    panY.value = clampNumber(panY.value, height - scaledHeight - CANVAS_PAD, CANVAS_PAD);
  }
}

/** 以画板内某个点为中心缩放（Ctrl/⌘+滚轮用）。 */
function applyZoom(next: number, focusX?: number, focusY?: number): void {
  const previous = zoom.value;
  const target = clampZoom(next);
  if (Math.abs(target - previous) < 0.001) return;
  if (focusX !== undefined && focusY !== undefined) {
    const worldX = (focusX - panX.value) / previous;
    const worldY = (focusY - panY.value) / previous;
    zoom.value = target;
    panX.value = focusX - worldX * target;
    panY.value = focusY - worldY * target;
  } else {
    zoom.value = target;
  }
  setCanvasScale(target);
  clampPan();
}

function layoutCanvas(): void {
  if (!artboardEl.value || sourceMode.value || viewState.value !== 'ready') return;
  if (zoomMode.value === 'fit') {
    zoom.value = fitZoom();
    setCanvasScale(zoom.value);
  }
  clampPan();
}

function scheduleLayout(): void {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    layoutCanvas();
  });
}

function setZoomPreset(preset: 'fit' | 'actual' | 'half'): void {
  const element = artboardEl.value;
  if (preset === 'fit') {
    zoomMode.value = 'fit';
    layoutCanvas();
    return;
  }
  zoomMode.value = 'manual';
  applyZoom(preset === 'actual' ? 1 : 0.5);
  if (element) {
    panX.value = (element.clientWidth - frameWidth.value * zoom.value) / 2;
    panY.value = CANVAS_PAD;
  }
  clampPan();
}

function onCanvasWheel(event: WheelEvent): void {
  if (sourceMode.value || viewState.value !== 'ready') return;
  const element = artboardEl.value;
  if (!element) return;
  const target = event.target;
  // 让代码块自己的滚动条工作，不抢滚轮。
  if (!event.ctrlKey && !event.metaKey && target instanceof Element && target.closest('.cm-scroller')) {
    return;
  }
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const rect = element.getBoundingClientRect();
    zoomMode.value = 'manual';
    applyZoom(
      zoom.value * Math.exp(-event.deltaY * 0.0015),
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    return;
  }
  // 不按 Ctrl 时滚轮 = 平移画布（保持“正文可滚动”）。
  panX.value -= event.deltaX;
  panY.value -= event.deltaY;
  clampPan();
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], .cm-editor'));
}

function onCanvasKeyDown(event: KeyboardEvent): void {
  if (event.code !== 'Space' || event.repeat) return;
  if (sourceMode.value || viewState.value !== 'ready') return;
  // 只在鼠标悬停画板时接管空格，避免影响列表/其它区域的滚动和按钮。
  if (!hoveringCanvas.value || isInteractiveTarget(event.target)) return;
  spaceHeld.value = true;
  event.preventDefault();
}

function onCanvasKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') spaceHeld.value = false;
}

function onCanvasPointerDown(event: PointerEvent): void {
  if (!(spaceHeld.value || event.button === 1)) return;
  const element = artboardEl.value;
  if (!element) return;
  event.preventDefault();
  event.stopPropagation();
  panning.value = true;
  panOrigin = { x: event.clientX, y: event.clientY, panX: panX.value, panY: panY.value };
  element.setPointerCapture(event.pointerId);
}

function onCanvasPointerMove(event: PointerEvent): void {
  if (!panning.value) return;
  event.preventDefault();
  panX.value = panOrigin.panX + (event.clientX - panOrigin.x);
  panY.value = panOrigin.panY + (event.clientY - panOrigin.y);
  clampPan();
}

function onCanvasPointerUp(event: PointerEvent): void {
  if (!panning.value) return;
  panning.value = false;
  const element = artboardEl.value;
  if (element?.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
}

/** 输入时把光标带回可视区（transform 画布没有原生滚动容器，这个要自己补）。 */
function ensureCaretVisible(): void {
  if (sourceMode.value || viewState.value !== 'ready') return;
  const board = artboardEl.value;
  const root = crepeRoot.value;
  if (!board || !root) return;
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const box = board.getBoundingClientRect();
  const margin = 32;
  let deltaY = 0;
  let deltaX = 0;
  if (rect.bottom > box.bottom - margin) deltaY = box.bottom - margin - rect.bottom;
  else if (rect.top < box.top + margin) deltaY = box.top + margin - rect.top;
  if (rect.right > box.right - margin) deltaX = box.right - margin - rect.right;
  else if (rect.left < box.left + margin) deltaX = box.left + margin - rect.left;
  if (deltaX === 0 && deltaY === 0) return;
  panX.value += deltaX;
  panY.value += deltaY;
  clampPan();
}

/* ---------- 断点配置 ---------- */

function applyBreakpoints(next: Breakpoint[]): void {
  const sorted = [...next].sort((left, right) => left.maxWidth - right.maxWidth);
  // 先同步 astro-blocks 的模块级断点表：它跨 Editor 实例存在，切站点后必须重置。
  setBreakpoints(sorted);
  const unchanged =
    sorted.length === breakpoints.value.length &&
    sorted.every((bp, index) => {
      const current = breakpoints.value[index];
      return (
        current !== undefined &&
        current.id === bp.id &&
        current.label === bp.label &&
        current.maxWidth === bp.maxWidth
      );
    });
  if (unchanged) return;
  breakpoints.value = sorted;
  // 断点表变了：检查器档位跟当前设备重新对齐，旧覆盖状态按新表重新解析。
  styleBp.value = bpForDevice(sessionStore.previewDevice);
  setCanvasScale(zoom.value);
  if (selectedBlock.value) {
    selectedBlock.value = parseXiaoHtml(selectedBlock.value.html, selectedBlock.value.pos, sorted);
  }
  scheduleLayout();
}

async function loadBreakpoints(siteDir: string): Promise<void> {
  let result: IpcResult<Record<string, unknown>>;
  try {
    result = await window.xiao.settings.read(siteDir);
  } catch {
    return;
  }
  if (!result.ok || siteDir !== activeSiteDir) return;
  const theme = result.data['theme'];
  const value =
    theme && typeof theme === 'object' ? (theme as Record<string, unknown>)['breakpoints'] : undefined;
  applyBreakpoints(resolveBreakpoints(value));
}

function refreshBreakpoints(): void {
  if (!activeSiteDir) return;
  const now = Date.now();
  if (now - breakpointsAt < 800) return;
  breakpointsAt = now;
  void loadBreakpoints(activeSiteDir);
}

function hintFor(key: FieldKey, normal: string): string {
  if (!hasFrontmatter.value) return '这篇没有 frontmatter，属性改动暂时不会写回文件。';
  if (blockedFields.value.includes(key)) return '这一项在 frontmatter 里是多行写法，请切到源码模式修改。';
  return normal;
}

/* ---------- frontmatter 读取与写回 ---------- */

function scalarValue(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 不是合法 JSON 的 YAML 转义，退回手工去引号。
    }
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** patchFrontmatter 内部用 String.replace 拼接，值里的 `$` 必须转义成 `$$` 才不会当成替换模式。 */
function yamlString(value: string): string {
  return JSON.stringify(value).replace(/\$/g, () => '$$');
}

function rawField(source: string, key: string): string {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(source);
  return match?.[1]?.trim() ?? '';
}

function readField(source: string, key: string): string {
  return scalarValue(rawField(source, key));
}

function detectSummaryKey(frontmatter: string): 'description' | 'summary' {
  if (/^description:/m.test(frontmatter)) return 'description';
  if (/^summary:/m.test(frontmatter)) return 'summary';
  return 'description';
}

function detectBlockedFields(frontmatter: string): FieldKey[] {
  const blocked: FieldKey[] = [];
  if (/^[>|]/.test(rawField(frontmatter, 'title'))) blocked.push('title');
  if (/^[>|]/.test(rawField(frontmatter, 'category'))) blocked.push('category');
  if (/^[>|]/.test(rawField(frontmatter, summaryKey.value))) blocked.push('summary');
  return blocked;
}

function countChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function snapshotFields(): FieldSnapshot {
  return {
    title: title.value,
    category: category.value,
    description: summary.value,
    draft: draft.value,
  };
}

/** 只把真正改过的键交给 patchFrontmatter，避免每次保存都重写一遍 frontmatter 的引号。 */
function fieldPatch(fields: FieldSnapshot): Record<string, string> {
  const patch: Record<string, string> = {};
  if (fields.title !== baseline.title) patch.title = yamlString(fields.title);
  if (fields.description !== baseline.description) {
    patch[summaryKey.value] = yamlString(fields.description);
  }
  if (fields.category !== baseline.category) patch.category = yamlString(fields.category);
  if (fields.draft !== baseline.draft) patch.draft = fields.draft ? 'true' : 'false';
  return patch;
}

function hasFieldChanges(): boolean {
  return Object.keys(fieldPatch(snapshotFields())).length > 0;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

/* ---------- 保存 ---------- */

function currentBody(): string | undefined {
  if (sourceMode.value) return sourceEditor?.getValue() ?? pendingSourceText;
  if (crepeReady && crepe) return crepe.getMarkdown();
  return pendingVisualText || undefined;
}

function scheduleSave(delay = 1000): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    void persist();
  }, delay);
}

function clearSaveTimer(): void {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
}

function enqueue(run: () => Promise<void>): Promise<void> {
  const next = chain.then(run, run);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function touchEdits(): void {
  if (!session) return;
  editSeq += 1;
  session = markDirty(session);
  sessionStore.setSaveState('dirty');
  scheduleSave();
}

function notifySaveFailure(saved: SaveResult): void {
  if (saved.reason === 'GUARDED_BLOCK_EDITED') {
    notify(
      '有受保护的原始格式（链接定义、HTML 或 ::: 容器）被编辑器改动了，已保留磁盘上的原文。请切到源码模式改这一段，或撤销这次改动。',
      'error',
      'editor-save',
    );
    return;
  }
  notify(
    '这次改动没能安全写回：和原文的差异超出了编辑器能保证的范围。请按 Ctrl+S 重试，或切到源码模式逐段修改。',
    'error',
    'editor-save',
  );
}

/**
 * 保存顺序上串行执行，避免两次写盘互相覆盖。
 * 正文和属性在调用时同步抓取快照——卸载时 crepe 可能已经被销毁，晚一步就抓不到了。
 */
function persist(): Promise<void> {
  if (!session) return Promise.resolve();
  const body = currentBody();
  if (body === undefined) {
    // Crepe 正在挂载：稍等再存，但别无限重试成死循环。
    if (viewState.value === 'ready' && !sourceMode.value && bodyRetries < 10) {
      bodyRetries += 1;
      scheduleSave(150);
    }
    return Promise.resolve();
  }
  bodyRetries = 0;
  const fields = snapshotFields();
  const patch = fieldPatch(fields);
  const seq = editSeq;
  const bodyChanged = bodyEdited;
  const target = { siteDir: activeSiteDir, slug: activeSlug };
  return enqueue(async () => {
    const current = session;
    if (!current) return;
    try {
      // 没动正文时用磁盘上的正文做输入，避免只改标题也把整篇 Markdown 重新序列化。
      const saved = saveMarkdown(current, bodyChanged ? body : current.body, patch);
      if (!saved.write) {
        if (saved.reason === 'clean' || saved.reason === 'unchanged' || saved.reason === 'identical') {
          session = openMarkdown(saved.text);
          baseline = fields;
          if (seq === editSeq) {
            bodyEdited = false;
            sessionStore.setSaveState('saved');
          } else {
            session = markDirty(session);
            sessionStore.setSaveState('dirty');
            scheduleSave();
          }
          return;
        }
        sessionStore.setSaveState('dirty');
        notifySaveFailure(saved);
        return;
      }
      sessionStore.setSaveState('saving');
      const result = await window.xiao.content.write(target.siteDir, target.slug, saved.text);
      if (!result.ok) {
        sessionStore.setSaveState('dirty');
        notify(
          `保存失败：${result.message}。请确认这篇还在，或按 Ctrl+S 重试；一直失败的话回到文章列表刷新一次。`,
          'error',
          'editor-save',
        );
        return;
      }
      session = openMarkdown(saved.text);
      baseline = fields;
      if (seq === editSeq) {
        bodyEdited = false;
        sessionStore.setSaveState('saved');
      } else {
        // 写盘期间又有新编辑：内容还在编辑器里，标回 dirty 让自动保存接着写。
        session = markDirty(session);
        sessionStore.setSaveState('dirty');
        scheduleSave();
      }
    } catch (error) {
      sessionStore.setSaveState('dirty');
      notify(
        `保存时出错了：${describeError(error)}。请按 Ctrl+S 重试。`,
        'error',
        'editor-save',
      );
    }
  });
}

async function flush(): Promise<void> {
  clearSaveTimer();
  if (!session) {
    await chain;
    return;
  }
  if (session.dirty || hasFieldChanges()) await persist();
  else await chain;
}

function saveNow(): void {
  clearSaveTimer();
  void persist();
}

function onSaveShortcut(): void {
  saveNow();
}

/* ---------- Crepe（所见即所得） ---------- */

async function destroyEditors(): Promise<void> {
  selectedBlock.value = null;
  setHtmlPickHandler(undefined);
  crepeRoot.value?.removeEventListener('mousedown', onCrepeMouseDown);
  clearHtmlSelection();
  crepeReady = false;
  const current = crepe;
  crepe = undefined;
  if (current) {
    try {
      await current.destroy();
    } catch {
      // Crepe 已经销毁过时不再打断后续清理。
    }
  }
  disposeSource();
}

function resetScroll(): void {
  if (bodyElement.value) bodyElement.value.scrollTop = 0;
}

function disposeSource(): void {
  sourceEditor?.dispose();
  sourceEditor = undefined;
  sourceModel?.dispose();
  sourceModel = undefined;
  pendingSourceText = session?.body ?? '';
  sourceMode.value = false;
}

function focusVisual(): void {
  const editable = crepeRoot.value?.querySelector<HTMLElement>('.ProseMirror');
  editable?.focus();
}

async function mountCrepeUnsafe(body: string, gen = generation): Promise<void> {
  await nextTick();
  if (gen !== generation) return;
  const rootElement = crepeRoot.value;
  if (!rootElement) return;
  await destroyEditors();
  if (gen !== generation) return;
  pendingVisualText = body;
  const instance = new Crepe({
    root: rootElement,
    defaultValue: body,
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: '写点什么，或按 / 插入标题、列表、图片…' },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: '文本',
          text: { label: '正文' },
          h1: { label: '标题 1' },
          h2: { label: '标题 2' },
          h3: { label: '标题 3' },
          h4: { label: '标题 4' },
          h5: { label: '标题 5' },
          h6: { label: '标题 6' },
          quote: { label: '引用' },
          divider: { label: '分隔线' },
        },
        listGroup: {
          label: '列表',
          bulletList: { label: '无序列表' },
          orderedList: { label: '有序列表' },
          taskList: { label: '待办' },
        },
        advancedGroup: {
          label: '高级',
          image: { label: '图片' },
          codeBlock: { label: '代码块' },
          table: { label: '表格' },
          math: { label: '公式' },
        },
        buildMenu: (builder) => {
          registerAstroSlashGroups(builder);
        },
      },
      [Crepe.Feature.ImageBlock]: {
        onUpload: async (file: File) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          bytes.forEach((item) => {
            binary += String.fromCharCode(item);
          });
          const saved = await window.xiao.content.saveImage(
            activeSiteDir,
            activeSlug,
            file.name,
            btoa(binary),
          );
          if (!saved.ok) {
            notify(
              `图片没能保存：${saved.message}。确认文章目录还在后重试，或先把图片放到文章目录里再插入。`,
              'error',
              'editor-image',
            );
            throw new Error(saved.message);
          }
          return saved.data;
        },
        proxyDomURL: (url: string) => {
          if (!url.startsWith('./')) return url;
          const name = encodeURIComponent(url.slice(2));
          const site = encodeURIComponent(activeSiteDir);
          return `xiao-asset://local/${name}?site=${site}&slug=${encodeURIComponent(activeSlug)}`;
        },
      },
    },
  });
  crepe = instance;
  await instance.create();
  instance.editor.action((ctx: unknown) => {
    attachHtmlNodeViews(ctx);
  });
  setHtmlPickHandler(onPickBlock);
  rootElement.addEventListener('mousedown', onCrepeMouseDown);
  if (gen !== generation || crepe !== instance) {
    await instance.destroy();
    return;
  }
  crepeReady = true;
  pendingVisualText = '';
  bodyRetries = 0;
  instance.on((listener) => {
    listener.markdownUpdated((_ctx, markdown) => {
      if (gen !== generation) return;
      charCount.value = countChars(markdown);
      bodyEdited = true;
      touchEdits();
      requestAnimationFrame(ensureCaretVisible);
    });
  });
  scheduleLayout();
}

/** Crepe 初始化失败时给出中文错误页，内容仍可在源码模式里查看。 */
async function mountCrepe(body: string, gen = generation): Promise<void> {
  try {
    await mountCrepeUnsafe(body, gen);
  } catch (error) {
    const failed = crepe;
    crepe = undefined;
    crepeReady = false;
    if (failed) {
      try {
        await failed.destroy();
      } catch {
        // 半初始化状态下 destroy 也可能失败，忽略即可。
      }
    }
    if (gen !== generation) return;
    errorKind.value = 'mount';
    loadError.value = `所见即所得编辑器没能初始化（${describeError(error)}）`;
    viewState.value = 'error';
    notify(
      '所见即所得编辑器没能初始化。可以点「重新加载」再试，或切到源码模式查看正文。',
      'error',
      'editor-mount',
    );
  }
}

/* ---------- Monaco（源码模式） ---------- */

function syncMonacoTheme(): void {
  monaco.editor.setTheme(sessionStore.theme === 'dark' ? 'vs-dark' : 'vs');
}

async function enterSource(): Promise<void> {
  if (!session || sourceMode.value) return;
  selectedBlock.value = null;
  clearHtmlSelection();
  const text = currentBody() ?? session.body;
  pendingSourceText = text;
  sourceMode.value = true;
  await nextTick();
  resetScroll();
  if (!session || !sourceMode.value || sourceEditor) return;
  const host = sourceRoot.value;
  if (!host) return;
  const model = monaco.editor.createModel(text, 'markdown');
  sourceModel = model;
  sourceInitial = text;
  sourceEditor = monaco.editor.create(host, {
    model,
    automaticLayout: true,
    wordWrap: 'on',
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    padding: { top: 16, bottom: 48 },
    theme: sessionStore.theme === 'dark' ? 'vs-dark' : 'vs',
  });
  model.onDidChangeContent(() => {
    charCount.value = countChars(model.getValue());
    bodyEdited = true;
    touchEdits();
  });
  await nextTick();
  sourceEditor.layout();
  sourceEditor.focus();
}

/**
 * 源码 → 所见即所得：不写盘，只把内容重新交给 Crepe。
 * session.body 始终保留“磁盘上的正文”作为写回基准，否则新改动会被误判成未改。
 */
function enterVisual(): void {
  if (!sourceMode.value) return;
  // Monaco 还没创建就切回来：源码没有任何改动，直接收起源码层。
  if (!sourceEditor) {
    disposeSource();
    return;
  }
  const text = sourceEditor.getValue();
  const edited = text !== sourceInitial;
  disposeSource();
  if (!session) return;
  if (!edited && crepeReady) return; // 源码没改：保留 Crepe 的光标和撤销栈
  if (!edited && text.trim().length === 0) {
    viewState.value = 'empty';
    return;
  }
  viewState.value = 'ready';
  zoomMode.value = 'fit';
  resetScroll();
  void mountCrepe(text);
}

async function beginWriting(): Promise<void> {
  if (!session || viewState.value !== 'empty') return;
  viewState.value = 'ready';
  zoomMode.value = 'fit';
  await mountCrepe(session.body);
  await nextTick();
  layoutCanvas();
  focusVisual();
}

/* ---------- 打开 / 关闭 ---------- */

async function loadCategories(siteDir: string, gen: number): Promise<void> {
  let result: IpcResult<{ slug: string; title: string; category: string; draft: boolean }[]>;
  try {
    result = await window.xiao.content.list(siteDir);
  } catch {
    return;
  }
  if (gen !== generation || !result.ok) return;
  const names = new Set<string>();
  for (const item of result.data) {
    if (item.category) names.add(item.category);
  }
  categoryList.value = [...names].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

async function open(): Promise<void> {
  const gen = ++generation;
  const siteDir = props.siteDir;
  const slug = props.slug;
  activeSiteDir = siteDir;
  activeSlug = slug;
  currentSlug.value = slug;
  clearSaveTimer();
  viewState.value = 'loading';
  errorKind.value = 'read';
  loadError.value = '';
  await destroyEditors();
  session = undefined;
  bodyEdited = false;
  pendingVisualText = '';
  zoomMode.value = 'fit';
  zoom.value = 1;
  hasFrontmatter.value = false;
  blockedFields.value = [];
  if (gen !== generation) return;

  let result: IpcResult<string>;
  try {
    result = await window.xiao.content.read(siteDir, slug);
  } catch (error) {
    if (gen !== generation) return;
    loadError.value = describeError(error);
    viewState.value = 'error';
    sessionStore.setSaveState('saved');
    return;
  }
  if (gen !== generation) return;
  if (!result.ok) {
    loadError.value = result.message;
    viewState.value = 'error';
    sessionStore.setSaveState('saved');
    return;
  }

  // 断点表跟着站点走；切文章不重复读配置。
  if (breakpointsSite !== siteDir) {
    breakpointsSite = siteDir;
    await loadBreakpoints(siteDir);
    if (gen !== generation) return;
  }
  // 打开文章时把检查器档位对齐到当前设备（设备可能在别的视图里被改过）。
  styleBp.value = bpForDevice(sessionStore.previewDevice);

  const opened = openMarkdown(result.data);
  session = opened;
  hasFrontmatter.value = opened.fmRaw.length > 0;
  summaryKey.value = detectSummaryKey(opened.fmRaw);
  blockedFields.value = detectBlockedFields(opened.fmRaw);

  // 程序化回填字段时不能让 watch 把文件标成 dirty。
  syncingFields = true;
  title.value = readField(opened.fmRaw, 'title');
  category.value = readField(opened.fmRaw, 'category');
  summary.value = readField(opened.fmRaw, summaryKey.value);
  draft.value = /^draft:[ \t]*true/m.test(opened.fmRaw);
  baseline = snapshotFields();
  syncingFields = false;

  charCount.value = countChars(opened.body);
  viewState.value = opened.body.trim().length > 0 ? 'ready' : 'empty';
  sessionStore.setSaveState('saved');

  if (viewState.value === 'ready') {
    await mountCrepe(opened.body, gen);
    if (gen === generation) {
      zoomMode.value = 'fit';
      await nextTick();
      layoutCanvas();
    }
  }
  void loadCategories(siteDir, gen);
}

async function reload(): Promise<void> {
  await flush();
  await open();
}

/* ---------- 顶栏动作 ---------- */

async function customize(): Promise<void> {
  const result = await window.xiao.content.customize(activeSiteDir, activeSlug);
  if (!result.ok) {
    notify(
      `没能为这篇生成独立布局：${result.message}。确认文章还在、磁盘可写后再试。`,
      'error',
      'editor-customize',
    );
    return;
  }
  notify('已为这篇生成独立布局，之后可以只改这一篇的排版，不影响其他文章。', 'info', 'editor-customize');
}

async function openPreview(): Promise<void> {
  sessionStore.setPreviewMode('dock');
  if (sessionStore.previewUrl || sessionStore.building) return;
  sessionStore.building = true;
  try {
    const result = await window.xiao.runtime.start('dev', activeSiteDir || props.siteDir);
    if (!result.ok) {
      notify(
        `预览没能启动：${result.message}。先确认站点依赖已经装好，再点一次「打开预览」。`,
        'error',
        'editor-preview',
      );
    }
  } catch (error) {
    notify(`预览没能启动：${describeError(error)}。请稍后重试。`, 'error', 'editor-preview');
  } finally {
    sessionStore.building = false;
  }
}

/* ---------- 浮层越界修正（沿用旧实现） ---------- */

const menuSelector = '.milkdown-slash-menu, .milkdown-toolbar, .milkdown-link-preview, .milkdown-link-edit';
let menuObserver: MutationObserver | undefined;
let menuFrame = 0;

function resetClampedMenu(element: HTMLElement): void {
  delete element.dataset.clamped;
  element.style.position = '';
  element.style.top = '';
  element.style.left = '';
  element.style.right = '';
  element.style.bottom = '';
  element.style.maxHeight = '';
  element.style.zIndex = '';
  const groups = element.querySelector<HTMLElement>('.menu-groups');
  if (groups) groups.style.maxHeight = '';
}

function writeStyle(element: HTMLElement, prop: 'position' | 'top' | 'left' | 'right' | 'bottom' | 'zIndex' | 'maxHeight', value: string): void {
  if (element.style[prop] !== value) element.style[prop] = value;
}

function applyClamp(element: HTMLElement, top: number, left: number): void {
  element.dataset.clamped = '1';
  writeStyle(element, 'position', 'fixed');
  writeStyle(element, 'top', `${top}px`);
  writeStyle(element, 'left', `${left}px`);
  writeStyle(element, 'right', 'auto');
  writeStyle(element, 'bottom', 'auto');
  writeStyle(element, 'zIndex', '80');
}

function clampMenus(): void {
  const scope = crepeRoot.value;
  if (!scope) return;
  const margin = 8;
  let retry = false;
  scope.querySelectorAll<HTMLElement>(menuSelector).forEach((element) => {
    if (element.getAttribute('data-show') === 'false') {
      if (!element.dataset.clamped) return;
      resetClampedMenu(element);
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 2) {
      retry = true;
      return;
    }
    let top = rect.top;
    let left = rect.left;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;

    if (element.classList.contains('milkdown-slash-menu')) {
      const tab = element.querySelector<HTMLElement>('.tab-group');
      const groups = element.querySelector<HTMLElement>('.menu-groups');
      const tabH = tab ? tab.getBoundingClientRect().height : 0;
      const spaceBelow = window.innerHeight - top - margin;
      const groupsMax = Math.max(160, Math.min(420, spaceBelow - tabH));
      if (groups) writeStyle(groups, 'maxHeight', `${Math.round(groupsMax)}px`);
    }

    applyClamp(element, Math.round(top), Math.round(left));
  });
  if (retry) {
    cancelAnimationFrame(menuFrame);
    menuFrame = requestAnimationFrame(clampMenus);
  }
}

function detectInspectorHost(): void {
  inspectorHost.value = Boolean(document.querySelector('#inspector-host'));
}

watch(
  () => sessionStore.previewDevice,
  (device) => {
    // 设备按钮 → 断点：电脑=base、平板=最宽、手机=最窄。
    styleBp.value = bpForDevice(device);
    scheduleLayout();
  },
);

watch(zoom, (value) => {
  setCanvasScale(value);
});

watch(styleBp, () => {
  scheduleLayout();
});

watch(breakpoints, () => {
  scheduleLayout();
});

watch(sourceMode, (value) => {
  if (!value) scheduleLayout();
});

onMounted(() => {
  if (!sessionStore.listCollapsed) {
    sessionStore.listCollapsed = true;
    collapsedListForEditor.value = true;
  }
  window.addEventListener('xiao:save', onSaveShortcut);
  window.addEventListener('resize', clampMenus);
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('keydown', onCanvasKeyDown);
  window.addEventListener('keyup', onCanvasKeyUp);
  window.addEventListener('focus', refreshBreakpoints);
  setCanvasScale(zoom.value);
  artboardObserver = new ResizeObserver(() => scheduleLayout());
  if (artboardEl.value) artboardObserver.observe(artboardEl.value);
  frameObserver = new ResizeObserver(() => clampPan());
  if (frameEl.value) frameObserver.observe(frameEl.value);
  const scope = crepeRoot.value;
  if (scope) {
    menuObserver = new MutationObserver(() => {
      cancelAnimationFrame(menuFrame);
      menuFrame = requestAnimationFrame(clampMenus);
    });
    menuObserver.observe(scope, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-show', 'class', 'style'],
    });
  }
  void nextTick().then(() => {
    detectInspectorHost();
    layoutCanvas();
  });
});

onBeforeUnmount(() => {
  if (collapsedListForEditor.value) sessionStore.listCollapsed = false;
  window.removeEventListener('xiao:save', onSaveShortcut);
  window.removeEventListener('resize', clampMenus);
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
  window.removeEventListener('keydown', onCanvasKeyDown);
  window.removeEventListener('keyup', onCanvasKeyUp);
  window.removeEventListener('focus', refreshBreakpoints);
  artboardObserver?.disconnect();
  frameObserver?.disconnect();
  cancelAnimationFrame(layoutFrame);
  clearSaveTimer();
  cancelAnimationFrame(menuFrame);
  menuObserver?.disconnect();
  generation += 1;
  // 旧实现漏了这一步：带着未保存改动切走/关闭会丢内容。persist 会先同步抓正文再异步写盘。
  if (session && (session.dirty || hasFieldChanges())) void persist();
  void destroyEditors();
});

watch(
  () => sessionStore.inspectorOpen,
  () => {
    // Shell 的 #inspector-host 是 v-if 渲染的；重新打开后要重挂 Teleport，否则属性不会回来。
    inspectorHost.value = false;
    void nextTick().then(detectInspectorHost);
  },
);

watch([title, category, summary, draft], () => {
  if (syncingFields || !session) return;
  touchEdits();
}, { flush: 'sync' });

watch(
  () => sessionStore.theme,
  () => syncMonacoTheme(),
);

watch(
  () => [props.siteDir, props.slug],
  () => {
    void reload();
  },
  { immediate: true },
);
</script>

<template>
  <div class="editor-view" :class="{ 'is-source': sourceMode }">
    <div class="editor-bar">
      <button
        type="button"
        class="save-chip"
        :class="sessionStore.saveState"
        :disabled="(viewState === 'loading' || viewState === 'error') && !sourceMode"
        :aria-label="`保存状态：${saveText}，点击立即保存`"
        @click="saveNow"
      >
        <UiSpinner v-if="sessionStore.saveState === 'saving'" :size="12" />
        <UiIcon v-else :path="saveIcon" :size="14" />
        <span>{{ saveText }}</span>
      </button>

      <div class="bar-grow" />

      <div v-if="!sourceMode && viewState === 'ready'" class="bar-group">
        <UiTooltip label="适应宽度（默认）">
          <UiButton
            size="sm"
            variant="ghost"
            :class="{ on: zoomMode === 'fit' }"
            aria-label="适应宽度"
            @click="setZoomPreset('fit')"
          >
            适应
          </UiButton>
        </UiTooltip>
        <UiTooltip label="缩放到 100%">
          <UiButton
            size="sm"
            variant="ghost"
            :class="{ on: zoomMode === 'manual' && Math.abs(zoom - 1) < 0.01 }"
            aria-label="缩放到百分之百"
            @click="setZoomPreset('actual')"
          >
            100%
          </UiButton>
        </UiTooltip>
        <UiTooltip label="缩放到 50%">
          <UiButton
            size="sm"
            variant="ghost"
            :class="{ on: zoomMode === 'manual' && Math.abs(zoom - 0.5) < 0.01 }"
            aria-label="缩放到百分之五十"
            @click="setZoomPreset('half')"
          >
            50%
          </UiButton>
        </UiTooltip>
        <span class="zoom-readout" :title="`框宽 ${frameWidth}px`">{{ zoomPercent }}</span>
      </div>

      <UiTooltip label="切换所见即所得与源码；来回切换不会写盘">
        <UiSegmented v-model="modeKey" :items="modeItems" aria-label="编辑模式" />
      </UiTooltip>

      <UiTooltip label="自定义此页：复制一份只属于这篇的布局">
        <UiButton
          :icon="icons.edit"
          :disabled="viewState === 'error' && !sourceMode"
          aria-label="自定义此页"
          @click="customize"
        >
          <span class="bar-label">自定义此页</span>
        </UiButton>
      </UiTooltip>

      <UiTooltip label="打开停靠预览；需要时自动启动 dev 服务器">
        <UiButton variant="primary" :icon="icons.preview" aria-label="打开预览" @click="openPreview">
          <span class="bar-label">打开预览</span>
        </UiButton>
      </UiTooltip>
    </div>

    <div ref="bodyElement" class="editor-body">
      <div v-if="viewState === 'loading' && !sourceMode" class="state-loading">
        <UiSpinner :size="20" />
        <p>正在打开这篇…</p>
      </div>

      <div v-else-if="viewState === 'error' && !sourceMode" class="state-panel">
        <UiEmpty :title="errorTitle" :description="errorHint" :icon="icons.alert">
          <template #action>
            <UiButton :icon-left="icons.refresh" @click="reload">重新加载</UiButton>
          </template>
        </UiEmpty>
      </div>

      <div v-else-if="showEmptyHint" class="state-panel">
        <UiEmpty
          title="这篇还没有正文"
          description="从第一段写起；标题、分类和摘要可以在右侧检查器里改。"
          :icon="icons.edit"
        >
          <template #action>
            <UiButton variant="primary" :icon-left="icons.edit" @click="beginWriting">开始写第一段</UiButton>
          </template>
        </UiEmpty>
      </div>

      <div v-show="!sourceMode && viewState === 'ready'" class="editor-workspace">
        <aside class="palette" aria-label="组件">
          <div class="palette-head">
            <UiInput v-model="paletteSearch" size="sm" :icon="icons.seo" placeholder="搜索组件" aria-label="搜索组件" />
          </div>
          <div class="palette-scroll">
            <div v-for="group in paletteGroups" :key="group.category" class="palette-group">
              <p class="palette-group__title">{{ group.label }}</p>
              <button
                v-for="block in group.items"
                :key="block.name"
                type="button"
                class="palette-item"
                :title="`拖到画板上，或点一下插入`"
                @pointerdown="onPalettePointerDown($event, block)"
                @click="onPaletteClick(block)"
              >
                <span class="palette-item__icon">
                  <UiIcon :path="categoryIcon[group.category]" :size="16" />
                </span>
                <span class="palette-item__label">{{ block.label }}</span>
              </button>
            </div>
          </div>
          <div class="palette-foot">{{ dropHint || '拖到画板落点；容器可套进去' }}</div>
        </aside>
        <div
          ref="artboardEl"
          class="artboard"
          :class="{ 'is-pan-ready': spaceHeld, 'is-panning': panning }"
          @wheel="onCanvasWheel"
          @pointerdown.capture="onCanvasPointerDown"
          @pointermove="onCanvasPointerMove"
          @pointerup="onCanvasPointerUp"
          @pointercancel="onCanvasPointerUp"
          @pointerenter="hoveringCanvas = true"
          @pointerleave="hoveringCanvas = false"
        >
          <div class="canvas-stage" :style="stageStyle">
            <div ref="frameEl" class="frame" :style="{ width: `${frameWidth}px` }">
              <div ref="crepeRoot" class="crepe" />
            </div>
          </div>
          <div class="canvas-hint">
            <span>框宽 {{ frameWidth }}px</span>
            <span class="canvas-hint__sep">·</span>
            <span>{{ zoomPercent }}</span>
            <span class="canvas-hint__sep">·</span>
            <span>Ctrl+滚轮缩放，空格或中键拖动</span>
          </div>
        </div>
      </div>
      <div v-show="sourceMode" ref="sourceRoot" class="source" />
    </div>
    <div
      v-if="dragGhost"
      class="drag-ghost"
      :style="{ left: `${dragGhost.x + 12}px`, top: `${dragGhost.y + 12}px` }"
    >
      {{ dragGhost.label }}
    </div>

    <Teleport v-if="inspectorHost" to="#inspector-host">
      <section class="inspector">
        <header class="inspector-head">
          <h3>{{ selectedBlock && !sourceMode ? selectedBlock.label : '文章属性' }}</h3>
          <div class="inspector-head-actions">
            <UiBadge :tone="saveTone" dot>{{ saveText }}</UiBadge>
            <UiTooltip label="收起文章属性">
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.chevronRight"
                aria-label="收起文章属性"
                @click="sessionStore.inspectorOpen = false"
              />
            </UiTooltip>
          </div>
        </header>

        <div class="inspector-body">
          <section v-if="selectedBlock && !sourceMode" class="block-edit">
            <h4>选中组件</h4>
            <p class="block-edit-name">{{ selectedBlock.label }}</p>
            <div class="bp-tabs">
              <UiSegmented v-model="bpKey" :items="bpItems" aria-label="样式断点" />
            </div>
            <div v-if="styleBp !== 'base'" class="bp-summary">
              <span>本断点已覆盖 {{ overrideCount }} 项</span>
              <UiTooltip v-if="overrideCount > 0" label="清除本断点的全部覆盖">
                <UiButton
                  variant="ghost"
                  size="sm"
                  :icon="icons.trash"
                  aria-label="清除本断点的全部覆盖"
                  @click="clearBreakpointOverrides"
                />
              </UiTooltip>
            </div>
            <p class="inspector-note">
              {{
                styleBp === 'base'
                  ? '电脑默认样式。断点样式没填就跟着这里走。'
                  : `只改「${bpLabel(styleBp)}」这个断点；留空表示跟随电脑。画布宽度用顶部设备按钮切换。`
              }}
            </p>

            <h5 class="block-edit-group">内容</h5>
            <UiField
              v-for="(text, index) in selectedBlock.texts"
              :key="index"
              :label="textSlotLabel(selectedBlock.key, index, selectedBlock.texts.length)"
            >
              <UiTextarea
                :model-value="text"
                :rows="selectedBlock.texts.length > 1 ? 2 : 3"
                @update:model-value="setBlockText(index, String($event))"
              />
            </UiField>
            <UiField v-if="hasStyleField(selectedBlock, 'href')" label="链接">
              <UiInput
                :model-value="selectedBlock.href"
                placeholder="/posts/hello/"
                @update:model-value="patchSelectedBlock({ href: String($event) })"
              />
            </UiField>
            <p v-if="selectedBlock.texts.length === 0 && !hasStyleField(selectedBlock, 'href')" class="inspector-note">
              这个组件的内容来自站点数据，下面只改外观。
            </p>

            <h5 class="block-edit-group">布局</h5>
            <UiField v-for="field in layoutStyleFields" :key="field.key" :label="field.label">
              <template #action>
                <span v-if="styleBp !== 'base'" class="field-state">
                  <UiBadge :tone="isOverridden(field.key) ? 'accent' : 'neutral'">
                    {{ isOverridden(field.key) ? '已覆盖' : '继承' }}
                  </UiBadge>
                  <UiTooltip v-if="isOverridden(field.key)" label="清除这一项的断点覆盖">
                    <UiButton
                      variant="ghost"
                      size="sm"
                      :icon="icons.close"
                      :aria-label="`清除${field.label}在本断点的覆盖`"
                      @click="clearStyle(field.key)"
                    />
                  </UiTooltip>
                </span>
              </template>
              <UiSelect
                class="style-select"
                :class="{
                  'is-inherited': styleBp !== 'base' && !isOverridden(field.key),
                  'is-overridden': isOverridden(field.key),
                }"
                :model-value="styleValue(field.key)"
                :options="bpOptions(field.options)"
                @update:model-value="patchStyle(field.key, String($event))"
              />
            </UiField>
            <UiField v-if="hasStyleField(selectedBlock, 'hide') && styleBp === 'base'" label="断点隐藏">
              <UiSelect
                :model-value="selectedBlock.hide"
                :options="hideSelectOptions"
                @update:model-value="patchSelectedBlock({ hide: String($event) })"
              />
            </UiField>

            <h5 class="block-edit-group">外观</h5>
            <UiField v-for="field in appearanceStyleFields" :key="field.key" :label="field.label">
              <template #action>
                <span v-if="styleBp !== 'base'" class="field-state">
                  <UiBadge :tone="isOverridden(field.key) ? 'accent' : 'neutral'">
                    {{ isOverridden(field.key) ? '已覆盖' : '继承' }}
                  </UiBadge>
                  <UiTooltip v-if="isOverridden(field.key)" label="清除这一项的断点覆盖">
                    <UiButton
                      variant="ghost"
                      size="sm"
                      :icon="icons.close"
                      :aria-label="`清除${field.label}在本断点的覆盖`"
                      @click="clearStyle(field.key)"
                    />
                  </UiTooltip>
                </span>
              </template>
              <UiSelect
                class="style-select"
                :class="{
                  'is-inherited': styleBp !== 'base' && !isOverridden(field.key),
                  'is-overridden': isOverridden(field.key),
                }"
                :model-value="styleValue(field.key)"
                :options="bpOptions(field.options)"
                @update:model-value="patchStyle(field.key, String($event))"
              />
            </UiField>
            <UiField v-if="hasStyleField(selectedBlock, 'type')" label="提示类型">
              <UiSelect
                :model-value="selectedBlock.type || 'info'"
                :options="TYPE_OPTIONS"
                @update:model-value="patchSelectedBlock({ type: String($event) })"
              />
            </UiField>
            <UiField v-if="hasStyleField(selectedBlock, 'heading')" label="标题级别">
              <UiSelect
                :model-value="selectedBlock.heading || '2'"
                :options="HEADING_OPTIONS"
                @update:model-value="patchSelectedBlock({ heading: String($event) })"
              />
            </UiField>
          </section>
          <p v-else-if="!sourceMode" class="inspector-note">
            把左侧组件拖到画板落点；点容器可以往里套。右侧按电脑/平板/手机改样式。
          </p>

          <h4 class="inspector-sub">文章属性</h4>
          <UiField label="标题" :hint="hintFor('title', '显示在文章顶部和列表里。')">
            <UiInput v-model="title" :disabled="!fieldsEditable" placeholder="给这篇文章起个标题" />
          </UiField>

          <UiField label="分类" :hint="hintFor('category', '用于文章列表里的分类树。')">
            <UiSelect v-model="category" :options="categoryOptions" :disabled="!fieldsEditable" />
          </UiField>

          <UiField label="摘要" :hint="hintFor('summary', '一两句话概括这篇，用于列表和搜索结果。')">
            <UiTextarea
              v-model="summary"
              :rows="3"
              :disabled="!fieldsEditable"
              placeholder="这篇讲了什么？"
            />
          </UiField>

          <UiField
            label="草稿"
            :hint="draft ? '草稿不会出现在站点里，构建时也跳过。' : '正文会随站点一起构建发布。'"
          >
            <UiSwitch v-model="draft" :disabled="!fieldsEditable" aria-label="草稿状态" />
          </UiField>

          <div class="inspector-meta">
            <div class="meta-row">
              <span class="meta-key">文件标识</span>
              <code class="meta-value">{{ currentSlug }}</code>
            </div>
            <div class="meta-row">
              <span class="meta-key">正文字数</span>
              <span class="meta-value">{{ charCount }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-key">自动保存</span>
              <span class="meta-value">停手 1 秒后写盘</span>
            </div>
          </div>

          <p v-if="viewState !== 'loading' && viewState !== 'error' && !hasFrontmatter" class="inspector-note">
            这篇没有 frontmatter，属性改动暂时不会写回文件；请先切到源码模式补上 frontmatter。
          </p>
        </div>
      </section>
    </Teleport>

    <!-- 断点样式按画板宽度生效：@media 已换成 @container，见 canvasCss。 -->
    <component :is="'style'">{{ canvasCss }}</component>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.editor-view.is-source .editor-body {
  overflow: hidden;
}

.editor-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s2);
  height: calc(var(--ui-s6) + var(--ui-s5));
  padding: 0 var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  background: var(--ui-panel);
}

.bar-grow {
  flex: 1;
}

.bar-group {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  padding: 0 var(--ui-s1);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
}

.zoom-readout {
  min-width: 38px;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.on {
  color: var(--ui-accent);
  background: var(--ui-accent-weak);
}

.bar-label {
  display: inline;
}

.save-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  height: var(--ui-h-sm);
  padding: 0 var(--ui-s2);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-lg);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--ui-dur) var(--ui-ease),
    border-color var(--ui-dur) var(--ui-ease),
    color var(--ui-dur) var(--ui-ease);
}

.save-chip:hover:not(:disabled) {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.save-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-chip.saved {
  border-color: var(--ui-ok-weak);
  color: var(--ui-ok);
}

.save-chip.dirty {
  border-color: var(--ui-warn-weak);
  color: var(--ui-warn);
}

.save-chip.saving {
  color: var(--ui-accent);
}

.save-chip.conflict {
  border-color: var(--ui-danger-weak);
  color: var(--ui-danger);
}

.editor-body {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-bg);
}

.editor-workspace {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  flex: 1;
  min-height: 0;
}

.palette {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-panel);
  border-right: 1px solid var(--ui-line);
}

.palette-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s1);
  min-height: 36px;
  padding: var(--ui-s2);
  border-bottom: 1px solid var(--ui-line);
}

.palette-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--ui-s2);
}

.palette-group__title {
  margin: var(--ui-s2) var(--ui-s1) var(--ui-s1);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
  padding: var(--ui-s1) var(--ui-s2);
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: grab;
}

.palette-item:hover {
  background: var(--ui-hover);
}

.palette-item__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--ui-s7);
  height: var(--ui-s7);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
}

.palette-item__label {
  overflow: hidden;
  font-size: var(--ui-fs-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-foot {
  padding: var(--ui-s2);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.artboard {
  position: relative;
  display: block;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #07090e;
  touch-action: none;
  --color-bg: var(--ui-bg);
  --color-surface: var(--ui-panel);
  --color-text: var(--ui-text);
  --color-text-2: var(--ui-text-2);
  --color-line: var(--ui-line);
  --color-accent: var(--ui-accent);
  --color-on-accent: var(--ui-on-accent);
  --space-1: var(--ui-s1);
  --space-2: var(--ui-s2);
  --space-4: var(--ui-s4);
  --space-5: var(--ui-s6);
  --space-6: var(--ui-s7);
  --space-8: var(--ui-s8);
  --radius-sm: var(--ui-r-sm);
  --radius-md: var(--ui-r);
  --radius-lg: var(--ui-r-lg);
  --shadow-1: var(--ui-shadow-1);
  --shadow-2: var(--ui-shadow-2);
  --w-narrow: 560px;
  --w-prose: 720px;
  --w-wide: 960px;
  --font-size-xs: 12px;
  --font-size-sm: 13px;
  --font-size-base: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 20px;
  --font-size-2xl: 22px;
  --font-size-3xl: 30px;
}

.artboard.is-pan-ready {
  cursor: grab;
}

.artboard.is-panning {
  cursor: grabbing;
  user-select: none;
}

/* 缩放/平移只走 transform，不改排版；坐标（拖柄位移）在 astro-blocks 里按缩放换算。 */
.canvas-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.canvas-hint {
  position: absolute;
  bottom: var(--ui-s2);
  left: var(--ui-s3);
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  padding: 2px var(--ui-s2);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-lg);
  background: var(--ui-panel);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  pointer-events: none;
}

.canvas-hint__sep {
  color: var(--ui-line-2);
}

.frame {
  container-type: inline-size;
  min-width: 0;
  height: auto;
  overflow: visible;
  background: var(--ui-bg);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 8%);
}

.crepe {
  display: block;
  height: auto;
  min-height: 0;
  overflow: visible;
}

.drag-ghost {
  position: fixed;
  z-index: 40;
  padding: 2px 8px;
  border-radius: var(--ui-r-sm);
  background: #3b82f6;
  color: #fff;
  font-size: var(--ui-fs-1);
  pointer-events: none;
}

.source {
  flex: 1;
  width: 100%;
  min-height: 0;
  height: 100%;
}

.state-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-s2);
  height: 100%;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.state-panel {
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: var(--ui-s6);
}

/* ---------- Crepe 暗色接入 ---------- */

.crepe :deep(.milkdown) {
  --crepe-color-background: var(--ui-bg);
  --crepe-color-on-background: var(--ui-text);
  --crepe-color-surface: var(--ui-panel);
  --crepe-color-surface-low: var(--ui-raise);
  --crepe-color-on-surface: var(--ui-text);
  --crepe-color-on-surface-variant: var(--ui-text-2);
  --crepe-color-outline: var(--ui-text-3);
  --crepe-color-primary: var(--ui-accent);
  --crepe-color-secondary: var(--ui-hover);
  --crepe-color-on-secondary: var(--ui-text-2);
  --crepe-color-inverse: var(--ui-text);
  --crepe-color-on-inverse: var(--ui-bg);
  --crepe-color-inline-code: var(--ui-accent);
  --crepe-color-error: var(--ui-danger);
  --crepe-color-hover: var(--ui-hover);
  --crepe-color-selected: var(--ui-active);
  --crepe-color-inline-area: var(--ui-raise);
  --crepe-base-font-size: var(--ui-fs-4);
  --crepe-font-default: var(--ui-font);
  --crepe-font-title: var(--ui-font);
  --crepe-font-code: var(--ui-mono);
  --crepe-shadow-1: var(--ui-shadow-1);
  --crepe-shadow-2: var(--ui-shadow-2);

  min-height: 0;
  height: auto;
  flex: none;
  overflow: visible;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.crepe :deep(.ProseMirror) {
  box-sizing: border-box;
  max-width: none;
  min-height: 240px;
  margin: 0;
  padding: var(--ui-s5) var(--ui-s6) var(--ui-s8);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-4);
  line-height: var(--ui-lh);
}

.crepe :deep(.ProseMirror:focus),
.crepe :deep(.ProseMirror:focus-visible) {
  outline: none;
}

.crepe :deep(.ProseMirror h1),
.crepe :deep(.ProseMirror h2),
.crepe :deep(.ProseMirror h3),
.crepe :deep(.ProseMirror h4),
.crepe :deep(.ProseMirror h5),
.crepe :deep(.ProseMirror h6) {
  color: var(--ui-text);
}

.crepe :deep(.ProseMirror a) {
  color: var(--ui-accent);
}

.crepe :deep(.ProseMirror code) {
  color: var(--ui-accent);
  font-family: var(--ui-mono);
}

/* 代码块语法高亮用 Crepe 默认的 oneDark，只把行号槽的底色并到 Studio 面板色。 */
.crepe :deep(.milkdown-code-block .cm-gutters) {
  border-right: 0;
  background: var(--ui-panel);
  color: var(--ui-text-3);
}

.crepe :deep(.milkdown-slash-menu[data-show='false']),
.crepe :deep(.milkdown-toolbar[data-show='false']),
.crepe :deep(.milkdown-link-preview[data-show='false']),
.crepe :deep(.milkdown-link-edit[data-show='false']) {
  display: none;
}

.crepe :deep(.milkdown-toolbar[data-show='true']),
.crepe :deep(.milkdown-slash-menu[data-show='true']),
.crepe :deep(.milkdown-link-preview[data-show='true']),
.crepe :deep(.milkdown-link-edit[data-show='true']) {
  z-index: 80;
}

.crepe :deep(.milkdown-slash-menu[data-show='true']) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.crepe :deep(.milkdown-slash-menu .menu-groups) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.crepe :deep(.xiao-html) {
  position: relative;
  display: block;
  width: 100%;
  margin: var(--ui-s4) 0;
  cursor: pointer;
}

.crepe :deep(.xiao-html.is-selected) {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

.crepe :deep(.xiao-html.is-drop) {
  outline: 2px dashed #3b82f6;
  outline-offset: -2px;
  background: rgb(59 130 246 / 12%);
}

.crepe :deep(.xiao-html.is-drop-before) {
  box-shadow: inset 0 2px 0 #3b82f6;
}

.crepe :deep(.xiao-html.is-drop-after) {
  box-shadow: inset 0 -2px 0 #3b82f6;
}

.crepe :deep(.xiao-html__handle) {
  position: absolute;
  z-index: 2;
  width: 10px;
  height: 10px;
  padding: 0;
  border: 2px solid #3b82f6;
  border-radius: 1px;
  background: #fff;
  display: none;
}

.crepe :deep(.xiao-html.is-selected .xiao-html__handle) {
  display: block;
}

.crepe :deep(.xiao-html__handle--drag) {
  left: -16px;
  top: 8px;
  height: 22px;
  cursor: grab;
}

.crepe :deep(.xiao-html__handle--width) {
  right: -5px;
  top: 50%;
  margin-top: -5px;
  cursor: ew-resize;
}

.crepe :deep(.xiao-html__handle--pad) {
  left: 50%;
  top: 4px;
  margin-left: -5px;
  cursor: ns-resize;
}

.crepe :deep(.xiao-html__body > *) {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: var(--ui-s4);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
}

.crepe :deep(.xiao-html .x-card),
.crepe :deep(.xiao-html .x-callout),
.crepe :deep(.xiao-html .x-quote),
.crepe :deep(.xiao-html .x-code) {
  display: block;
  padding: var(--ui-s4);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
}

.crepe :deep(.xiao-html .x-grid) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s3);
}

.crepe :deep(.xiao-html .x-cols-2) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.crepe :deep(.xiao-html .x-cols-3) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.crepe :deep(.xiao-html .x-cols-4) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.crepe :deep(.xiao-html .x-stack) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}

.crepe :deep(.xiao-html .x-dir-row) {
  flex-direction: row;
}

.crepe :deep(.xiao-html .x-dir-column) {
  flex-direction: column;
}

.crepe :deep(.xiao-html .x-align-center) {
  align-items: center;
}

.crepe :deep(.xiao-html .x-align-end) {
  align-items: flex-end;
}

.crepe :deep(.xiao-html .x-justify-center) {
  justify-content: center;
}

.crepe :deep(.xiao-html .x-justify-between) {
  justify-content: space-between;
}

.crepe :deep(.xiao-html .x-bg-primary) {
  background: var(--ui-accent);
  color: var(--ui-on-accent);
}

.crepe :deep(.xiao-html .x-bg-inverse) {
  background: var(--ui-text);
  color: var(--ui-bg);
}

.crepe :deep(.xiao-html .x-bg-muted) {
  color: var(--ui-text-2);
}

.crepe :deep(.xiao-html .x-width-narrow),
.crepe :deep(.xiao-html .x-width-prose) {
  max-width: 520px;
  margin-inline: auto;
}

.crepe :deep(.xiao-html .x-button) {
  display: inline-flex;
  padding: var(--ui-s1) var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-hover);
}

.crepe :deep(.xiao-html [data-xiao='text']) {
  margin: 0;
}

/* ---------- 检查器 ---------- */

.inspector {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: var(--ui-s3) var(--ui-s3) var(--ui-s6);
}

.inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  padding-bottom: var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.inspector-head-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
}

.inspector-head h3 {
  flex: 1;
  min-width: 0;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.block-edit {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
  margin-bottom: var(--ui-s4);
  padding-bottom: var(--ui-s4);
  border-bottom: 1px solid var(--ui-line);
}

.block-edit h4,
.inspector-sub {
  margin: 0 0 var(--ui-s2);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.block-edit-name {
  margin: 0;
  color: var(--ui-text);
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.block-edit-group {
  margin: var(--ui-s2) 0 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
  letter-spacing: 0.06em;
}

/* 断点 tabs：断点多时可横向滚动，不和设备按钮混淆（label 带「样式：」）。 */
.bp-tabs {
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.bp-tabs::-webkit-scrollbar {
  display: none;
}

.bp-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  padding: 2px var(--ui-s1) 2px var(--ui-s2);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
}

.field-state {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
}

/* 断点下的「继承」选项弱化显示；已覆盖的项边框带强调色。 */
.style-select.is-inherited :deep(.ui-select__control) {
  color: var(--ui-text-3);
}

.style-select.is-overridden :deep(.ui-select__control) {
  border-color: var(--ui-accent);
}

.inspector-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
  padding-top: var(--ui-s3);
}

.inspector-meta {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding-top: var(--ui-s2);
  border-top: 1px solid var(--ui-line);
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-s2);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.meta-key {
  color: var(--ui-text-3);
}

.meta-value {
  overflow: hidden;
  color: var(--ui-text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

code.meta-value {
  font-size: var(--ui-fs-1);
}

.inspector-note {
  padding: var(--ui-s2);
  border: 1px solid var(--ui-warn-weak);
  border-radius: var(--ui-r-sm);
  color: var(--ui-warn);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

@media (max-width: 1180px) {
  .bar-label {
    display: none;
  }

  .save-chip span {
    display: none;
  }
}
</style>
