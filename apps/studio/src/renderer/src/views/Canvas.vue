<script setup lang="ts">
import {
  mdiCodeTags,
  mdiFormatText,
  mdiLockOutline,
  mdiPackageVariantClosed,
  mdiPostOutline,
  mdiRedo,
  mdiTextShort,
  mdiUndo,
  mdiViewDashboardOutline,
  mdiWidgetsOutline,
} from '@mdi/js';
import * as monaco from 'monaco-editor';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import HtmlBlocks from './HtmlBlocks.vue';
import {
  groupStudioPages,
  htmlPostSlugOf,
  isStudioPageFile,
  isSystemPage,
  pageLabel,
} from '@xiao/core/site';
import { icons } from '../icons.ts';
import { installMonaco } from '../monaco-setup.ts';
import { notify } from '../notice.ts';
import { layoutSlugOf, useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
  UiDialog,
  UiEmpty,
  UiField,
  UiIcon,
  UiInput,
  UiPanel,
  UiSegmented,
  UiSelect,
  UiSlider,
  UiSpinner,
  UiSwitch,
  UiTextarea,
  UiTooltip,
} from '../ui/index.ts';
import WorkbenchBar from './WorkbenchBar.vue';

installMonaco();

// ---------------------------------------------------------------------------
// 数据形状（对应 env.d.ts / packages/core 的 canvas、page 类型）
// ---------------------------------------------------------------------------

interface OutlineNode {
  id: string;
  name: string;
  kind: string;
  text: string;
  locked: boolean;
  props: { name: string; value: string }[];
  children: OutlineNode[];
}

type ComponentCategory = 'structure' | 'container' | 'content' | 'blog' | 'embed';

interface ComponentMeta {
  name: string;
  label: string;
  category: ComponentCategory;
  /** 可以往里插子组件（与 manifest 的容器类一致）。 */
  container: boolean;
  /** 文字类组件（可直接改文字）。 */
  text: boolean;
}

interface PropOption {
  value: string;
  label: string;
}

interface PropSpec {
  name: string;
  label: string;
  type: string;
  options?: PropOption[];
  default?: unknown;
  unit?: string;
  min?: number;
  max?: number;
  placeholder?: string;
  advanced?: boolean;
  group: string;
}

type DraftValue = string | number | boolean;

type PageWidthOption = '' | 'narrow' | 'prose' | 'wide' | 'full';
type PagePaddingOption = '' | 'none' | 'sm' | 'md' | 'lg';
type PageBackgroundOption = '' | 'surface' | 'accent';

/**
 * 页面级样式（R-04）。
 * 落盘为 src/styles/pages/<slug>.css，模板侧靠 body[data-page='<slug>'] 命中。
 */
interface PageStyleState {
  width: PageWidthOption;
  padding: PagePaddingOption;
  background: PageBackgroundOption;
  hideSide: boolean;
  hideToc: boolean;
}

interface TreeRow {
  node: OutlineNode;
  depth: number;
  parentId: string | null;
  index: number;
  container: boolean;
}

interface InsertTarget {
  parentId: string;
  parentName: string;
  index: number;
  label: string;
}

// 组件清单（与 packages/core/src/components/manifest.ts 对齐；IPC 只返回名字，
// 这里维护显示用元数据。新增组件时同步补一条即可）。
const COMPONENTS: ComponentMeta[] = [
  // 结构
  { name: 'Section', label: '区块', category: 'structure', container: true, text: false },
  { name: 'Container', label: '容器', category: 'structure', container: true, text: false },
  { name: 'Stack', label: '堆叠', category: 'structure', container: true, text: false },
  { name: 'Grid', label: '网格', category: 'structure', container: true, text: false },
  { name: 'Columns', label: '分栏组', category: 'structure', container: true, text: false },
  { name: 'Column', label: '分栏', category: 'structure', container: true, text: false },
  // 容器
  { name: 'Card', label: '卡片', category: 'container', container: true, text: false },
  { name: 'Callout', label: '提示框', category: 'container', container: true, text: false },
  { name: 'Accordion', label: '折叠面板', category: 'container', container: true, text: false },
  { name: 'Tabs', label: '标签页', category: 'container', container: true, text: false },
  { name: 'TabPanel', label: '标签面板', category: 'container', container: true, text: false },
  // 内容
  { name: 'Text', label: '文本', category: 'content', container: false, text: true },
  { name: 'Heading', label: '标题', category: 'content', container: false, text: true },
  { name: 'RichText', label: '富文本', category: 'content', container: false, text: true },
  { name: 'Quote', label: '引用', category: 'content', container: false, text: true },
  { name: 'Code', label: '代码块', category: 'content', container: false, text: true },
  { name: 'Badge', label: '徽章', category: 'content', container: false, text: true },
  { name: 'Button', label: '按钮', category: 'content', container: false, text: true },
  { name: 'Link', label: '链接', category: 'content', container: false, text: true },
  { name: 'Icon', label: '图标', category: 'content', container: false, text: true },
  { name: 'Divider', label: '分隔线', category: 'content', container: false, text: false },
  { name: 'Spacer', label: '留白', category: 'content', container: false, text: false },
  // 博客
  { name: 'PostList', label: '文章列表', category: 'blog', container: false, text: false },
  { name: 'PostCard', label: '文章卡片', category: 'blog', container: false, text: false },
  { name: 'CategoryTree', label: '分类树', category: 'blog', container: false, text: false },
  { name: 'TagCloud', label: '标签云', category: 'blog', container: false, text: false },
  { name: 'Pagination', label: '翻页', category: 'blog', container: false, text: false },
  { name: 'Profile', label: '作者信息', category: 'blog', container: false, text: false },
  { name: 'Toc', label: '目录', category: 'blog', container: false, text: false },
  // 嵌入
  { name: 'Image', label: '图片', category: 'embed', container: false, text: false },
  { name: 'Gallery', label: '图库', category: 'embed', container: false, text: false },
  { name: 'Video', label: '视频', category: 'embed', container: false, text: false },
  { name: 'Embed', label: '嵌入', category: 'embed', container: false, text: false },
  { name: 'Html', label: '自定义 HTML', category: 'embed', container: false, text: false },
];

const CATEGORY_ORDER: ComponentCategory[] = ['structure', 'container', 'content', 'blog', 'embed'];

const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  structure: '结构',
  container: '容器',
  content: '内容',
  blog: '博客',
  embed: '嵌入',
};

const CATEGORY_ICON: Record<ComponentCategory, string> = {
  structure: mdiViewDashboardOutline,
  container: mdiPackageVariantClosed,
  content: mdiFormatText,
  blog: mdiPostOutline,
  embed: mdiCodeTags,
};

const META_BY_NAME = new Map(COMPONENTS.map((item) => [item.name, item]));

// 页面样式取值：按模板侧 canonical 变量约定
// （--page-width / --page-padding / --page-bg，模板侧已有兜底值）。
const PAGE_WIDTH_VALUES: Record<Exclude<PageWidthOption, ''>, string> = {
  narrow: '560px',
  prose: '720px',
  wide: '960px',
  full: '100%',
};
const PAGE_PADDING_VALUES: Record<Exclude<PagePaddingOption, ''>, string> = {
  none: '0',
  sm: '16px',
  md: '32px',
  lg: '48px',
};
const PAGE_BACKGROUND_VALUES: Record<Exclude<PageBackgroundOption, ''>, string> = {
  surface: 'var(--color-surface)',
  accent: 'var(--color-accent-soft)',
};

const PAGE_WIDTH_OPTIONS: PropOption[] = [
  { value: '', label: '默认（跟站点）' },
  { value: 'narrow', label: '窄' },
  { value: 'prose', label: '正文宽' },
  { value: 'wide', label: '宽' },
  { value: 'full', label: '通栏' },
];
const PAGE_PADDING_OPTIONS: PropOption[] = [
  { value: '', label: '默认' },
  { value: 'none', label: '无' },
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
];
const PAGE_BACKGROUND_OPTIONS: PropOption[] = [
  { value: '', label: '默认' },
  { value: 'surface', label: '浅色块' },
  { value: 'accent', label: '强调弱底' },
];

const HTML_CONTAINERS = new Set([
  'div',
  'section',
  'main',
  'article',
  'aside',
  'header',
  'footer',
  'nav',
]);

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

const session = useSession();

const pages = ref<string[]>([]);
const outline = ref<OutlineNode[]>([]);
const loading = ref(true);
const error = ref('');
const pageRoute = ref('');

// 文章版式模式（P2）：activePage 指向 src/layouts/posts/<slug>.astro 时进入。
const layoutSlug = computed(() => layoutSlugOf(session.activePage));
const layoutMode = computed(() => Boolean(layoutSlug.value));
const layoutTitle = computed(() => session.layoutTitle);
const htmlPostSlug = computed(() => htmlPostSlugOf(session.activePage));
const htmlPostMode = computed(() => Boolean(htmlPostSlug.value));
const htmlStandalone = ref(false);
const htmlChromeItems = [
  { key: 'template', label: '套用模板' },
  { key: 'page', label: '独立成页' },
];
const htmlChromeKey = computed({
  get: () => (htmlStandalone.value ? 'page' : 'template'),
  set: (value: string) => {
    void setHtmlChrome(value === 'page');
  },
});

const selectedId = ref('');
const expanded = ref<string[]>([]);
const focusedRowId = ref('');

const propSpecs = ref<PropSpec[]>([]);
const draft = ref<Record<string, DraftValue>>({});
const textDraft = ref('');
const propsLoading = ref(false);
const blocked = ref<Record<string, string>>({});

const search = ref('');
const busy = ref(false);
const insertPending = ref('');

const newSlug = ref('');
const newTemplate = ref<'blank' | 'landing' | 'about'>('blank');
const creating = ref(false);

const templateItems = [
  { key: 'blank', label: '空白' },
  { key: 'landing', label: '落地页' },
  { key: 'about', label: '关于' },
];

// 页面样式（R-04）
const pageStyle = reactive<PageStyleState>({
  width: '',
  padding: '',
  background: '',
  hideSide: false,
  hideToc: false,
});
const pageStyleExisting = ref('');
const pageStyleExists = ref(false);
const pageStyleKnown = ref(true);
const pageStyleLoading = ref(false);
const pageStyleSaving = ref(false);
const overwriteStyleOpen = ref(false);
const resetStyleOpen = ref(false);
let styleToken = 0;
let styleKey = '';

const specCache = new Map<string, PropSpec[]>();
const nestCache = new Map<string, boolean>();
const hostReady = ref(false);
const boardEl = ref<HTMLElement | null>(null);
const sourceRoot = ref<HTMLElement | null>(null);
const sourceMode = ref(false);
let sourceEditor: monaco.editor.IStandaloneCodeEditor | undefined;
let sourceModel: monaco.editor.ITextModel | undefined;
let sourceSaved = '';
let sourceTimer = 0;
let sourceGen = 0;
const layersCollapsed = ref(false);
const collapsedListForStage = ref(false);
const stageZoom = ref(1);
const dragGhost = ref<{ label: string; x: number; y: number } | null>(null);
const dropLabel = ref('');

type StageHit = { file: string; offset: string; place: 'before' | 'after' | 'into'; tag: string };
type DragKind =
  | { kind: 'new'; name: string; label: string }
  | { kind: 'move'; id: string; name: string; label: string };

let dragArmed: { x: number; y: number; payload: DragKind } | null = null;
let dragActive: DragKind | null = null;
let lastHit: StageHit | null = null;
let hitFrame = 0;
let skipPaletteClick = false;

// 写操作串行化，避免连续改属性时两次 reload 互相覆盖。
let writeQueue: Promise<unknown> = Promise.resolve();
let propsToken = 0;
let reloadToken = 0;
let nestToken = 0;
let stopPick: () => void = () => undefined;
let stopInsert: () => void = () => undefined;
let stopText: () => void = () => undefined;
let stopResize: () => void = () => undefined;
let stopCamera: () => void = () => undefined;
let stageFrame = 0;
let stageObserver: ResizeObserver | null = null;

function sequenced<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ---------------------------------------------------------------------------
// 结构树的派生数据
// ---------------------------------------------------------------------------

function findNode(nodes: OutlineNode[], id: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findNode(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

function pathOf(nodes: OutlineNode[], id: string, acc: number[] = []): number[] | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;
    const next = [...acc, index];
    if (node.id === id) return next;
    const nested = pathOf(node.children, id, next);
    if (nested) return nested;
  }
  return null;
}

function atPath(nodes: OutlineNode[], path: number[]): OutlineNode | undefined {
  let level = nodes;
  let node: OutlineNode | undefined;
  for (const index of path) {
    node = level[index];
    if (!node) return undefined;
    level = node.children;
  }
  return node;
}

function isLayoutName(name: string): boolean {
  return name.endsWith('Layout') || name === 'Fragment';
}

function isContainerNode(node: OutlineNode): boolean {
  if (node.kind === 'text' || node.locked) return false;
  const meta = META_BY_NAME.get(node.name);
  if (meta) return meta.container;
  return HTML_CONTAINERS.has(node.name) || isLayoutName(node.name);
}

function flatten(nodes: OutlineNode[], depth = 0, parentId: string | null = null): TreeRow[] {
  const rows: TreeRow[] = [];
  nodes.forEach((node, index) => {
    rows.push({ node, depth, parentId, index, container: isContainerNode(node) });
    if (node.children.length) rows.push(...flatten(node.children, depth + 1, node.id));
  });
  return rows;
}

const allRows = computed(() => flatten(outline.value));
const nodeMap = computed(() => new Map(allRows.value.map((row) => [row.node.id, row])));

function isExpanded(row: TreeRow): boolean {
  return expanded.value.includes(row.node.id);
}

const visibleRows = computed(() => {
  const rows: TreeRow[] = [];
  const walk = (nodes: OutlineNode[], depth: number, parentId: string | null): void => {
    for (const node of nodes) {
      const row: TreeRow = {
        node,
        depth,
        parentId,
        index: rows.length,
        container: isContainerNode(node),
      };
      rows.push(row);
      if (node.children.length && expanded.value.includes(node.id)) {
        walk(node.children, depth + 1, node.id);
      }
    }
  };
  walk(outline.value, 0, null);
  return rows;
});

const totalNodes = computed(() => allRows.value.length);
const selectedRow = computed(() => nodeMap.value.get(selectedId.value));
const selectedNode = computed(() => selectedRow.value?.node);

const singleTextChild = computed(() => {
  const node = selectedNode.value;
  if (!node || node.kind === 'text') return undefined;
  const texts = node.children.filter((child) => child.kind === 'text');
  return texts.length === 1 ? texts[0] : undefined;
});

const selectedTitle = computed(() => {
  const node = selectedNode.value;
  if (!node) return '';
  if (node.kind === 'text') return '文字';
  if (node.kind === 'locked') return '模板代码';
  if (isSlotNode(node)) return '正文';
  return META_BY_NAME.get(node.name)?.label ?? node.name;
});

const selectedPath = computed(() => {
  const row = selectedRow.value;
  if (!row) return '';
  const labels = [labelOfNode(row.node)];
  let parentId = row.parentId;
  while (parentId) {
    const parent = nodeMap.value.get(parentId);
    if (!parent) break;
    labels.unshift(labelOfNode(parent.node));
    parentId = parent.parentId;
  }
  return labels.join(' / ');
});

const selectedIcon = computed(() =>
  selectedNode.value ? rowIcon(selectedNode.value) : icons.pages,
);

const selectedKindLabel = computed(() => {
  const node = selectedNode.value;
  if (!node) return '';
  if (isSlotNode(node)) return '正文插槽';
  return kindLabel(node);
});

const selectedTextNode = computed(() => {
  const node = selectedNode.value;
  if (!node) return undefined;
  return node.kind === 'text' ? node : singleTextChild.value;
});

// 插入目标：优先放进选中的容器末尾；选中的是叶子则插到它后面；否则放进根容器末尾。
const insertTarget = computed<InsertTarget | null>(() => {
  const row = selectedRow.value;
  if (row) {
    if (row.container) {
      return {
        parentId: row.node.id,
        parentName: row.node.name,
        index: row.node.children.length,
        label: `${labelOfNode(row.node)} 末尾`,
      };
    }
    let child = row;
    while (child.parentId) {
      const parent = nodeMap.value.get(child.parentId);
      if (!parent) break;
      if (parent.container) {
        return {
          parentId: parent.node.id,
          parentName: parent.node.name,
          index: child.index + 1,
          label: `${labelOfNode(parent.node)} 中 · ${labelOfNode(row.node)} 之后`,
        };
      }
      child = parent;
    }
  }
  const root = allRows.value.find((item) => item.depth === 0 && item.container);
  if (!root) return null;
  return {
    parentId: root.node.id,
    parentName: root.node.name,
    index: root.node.children.length,
    label: `${labelOfNode(root.node)} 末尾`,
  };
});

function lastVisibleDescendantId(index: number): string {
  const rows = visibleRows.value;
  const row = rows[index];
  if (!row) return '';
  let last = row;
  for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
    const next = rows[cursor];
    if (!next || next.depth <= row.depth) break;
    last = next;
  }
  return last.node.id;
}

const insertAnchorId = computed(() => {
  const target = insertTarget.value;
  if (!target) return '';
  const parent = nodeMap.value.get(target.parentId);
  if (!parent) return '';
  const anchorId =
    target.index <= 0
      ? target.parentId
      : (parent.node.children[target.index - 1]?.id ?? target.parentId);
  const index = visibleRows.value.findIndex((row) => row.node.id === anchorId);
  if (index < 0) return target.parentId;
  return lastVisibleDescendantId(index);
});

// ---------------------------------------------------------------------------
// 属性面板分组
// ---------------------------------------------------------------------------

const PROP_GROUP_ORDER: { key: string; label: string }[] = [
  { key: 'content', label: '内容' },
  { key: 'layout', label: '布局' },
  { key: 'style', label: '样式' },
  { key: 'responsive', label: '响应式' },
  { key: 'advanced', label: '高级' },
];

const groupedProps = computed(() => {
  const groups = new Map<string, PropSpec[]>();
  for (const spec of propSpecs.value) {
    const key = spec.advanced ? 'advanced' : (spec.group ?? 'content');
    const list = groups.get(key) ?? [];
    list.push(spec);
    groups.set(key, list);
  }
  return PROP_GROUP_ORDER.filter((group) => groups.has(group.key)).map((group) => ({
    key: group.key,
    label: group.label,
    specs: groups.get(group.key) ?? [],
  }));
});

/** HTML 即时编辑先看样式和布局，内容属性放后面。图层只指 z-index，不指 DOM。 */
const inspectorGroups = computed(() => {
  const groups = groupedProps.value;
  if (!htmlPostMode.value) return groups;
  const front = groups.filter((group) => group.key === 'style' || group.key === 'layout');
  const rest = groups.filter((group) => group.key !== 'style' && group.key !== 'layout');
  return [...front, ...rest];
});

function specLabel(spec: PropSpec): string {
  if (spec.name === 'z' || spec.name === 'zIndex' || spec.name === 'layer') return '图层';
  return spec.label;
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

function labelOfNode(node: OutlineNode): string {
  if (node.kind === 'text') {
    const text = node.text.trim();
    if (!text) return '（空文字）';
    return `“${text.length > 24 ? `${text.slice(0, 24)}…` : text}”`;
  }
  if (node.kind === 'locked') {
    return node.name === 'locked' ? '表达式（锁定）' : `${node.name}（锁定）`;
  }
  if (isSlotNode(node)) return '正文';
  return META_BY_NAME.get(node.name)?.label ?? node.name;
}

function isSlotNode(node: OutlineNode): boolean {
  return node.kind !== 'locked' && node.name === 'slot';
}

function nodeMetaText(node: OutlineNode): string {
  if (node.kind === 'text' || node.kind === 'locked') return '';
  if (isSlotNode(node)) return 'slot';
  const meta = META_BY_NAME.get(node.name);
  return meta ? node.name : '';
}

function kindLabel(node: OutlineNode): string {
  switch (node.kind) {
    case 'text':
      return '文字';
    case 'locked':
      return '模板代码';
    case 'component':
      return '组件';
    case 'element':
      return '元素';
    default:
      return node.kind;
  }
}

function rowIcon(node: OutlineNode): string {
  if (node.kind === 'locked') return mdiLockOutline;
  if (node.kind === 'text') return mdiTextShort;
  if (isSlotNode(node)) return mdiFormatText;
  const meta = META_BY_NAME.get(node.name);
  if (meta) return CATEGORY_ICON[meta.category];
  if (isLayoutName(node.name)) return icons.pages;
  if (node.kind === 'component') return mdiWidgetsOutline;
  return mdiCodeTags;
}

function canvasHoldsPreview(): boolean {
  return (
    !sourceMode.value &&
    (session.nav === 'pages' ||
      (session.nav === 'posts' && (layoutMode.value || htmlPostMode.value)))
  );
}

const workbenchMode = computed({
  get: () => (sourceMode.value ? 'source' : 'visual'),
  set: (value: 'visual' | 'source') => {
    if (value === 'source') void enterSource();
    else void enterVisual();
  },
});

const kindBadge = computed(() => {
  if (htmlPostMode.value) return 'HTML';
  if (layoutMode.value) return '文章版式';
  return pageLabel(session.activePage);
});

function friendlyError(message: string): string {
  if (/解析|parse|diagnostic/i.test(message)) {
    return `页面源码有语法错误，结构读不出来：${message}。修好语法后点刷新重试。`;
  }
  return `${message}。确认文件没被占用后点刷新重试，或去开发者模式打开源码。`;
}

function rowDomId(id: string): string {
  return `canvas-node-${id}`;
}

function historyHint(): string {
  return '撤销 / 重做按页面文件记录；外部改了文件会重置历史。';
}

function canReset(spec: PropSpec): boolean {
  if (spec.default === undefined) return false;
  if (spec.type === 'boolean') return false;
  const current = draft.value[spec.name];
  return String(current ?? '') !== String(spec.default);
}

function convertDefault(spec: PropSpec): DraftValue {
  const value = spec.default;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function displayValue(spec: PropSpec): string {
  const value = draft.value[spec.name];
  if (value === undefined || value === '') return '未设置（用默认）';
  return String(value);
}

function propRange(spec: PropSpec): string {
  const unit = spec.unit ?? '';
  return `${spec.min ?? 0}–${spec.max ?? 100}${unit}`;
}

function optionItems(spec: PropSpec): PropOption[] {
  return spec.options?.length ? spec.options : [{ value: '', label: '未设置' }];
}

function paletteHint(meta: ComponentMeta): string {
  if (meta.container) return '可嵌套其他组件';
  if (meta.text) return '文字内容，检查器里可改';
  if (meta.category === 'blog') return '读取站点数据';
  if (meta.category === 'embed') return '嵌入外部资源';
  return '独立内容块';
}

const filteredGroups = computed(() => {
  const needle = search.value.trim().toLowerCase();
  const hideBlog = htmlPostMode.value;
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    icon: CATEGORY_ICON[category],
    items: COMPONENTS.filter(
      (meta) =>
        meta.category === category &&
        !(hideBlog && meta.category === 'blog') &&
        (needle === '' ||
          meta.label.toLowerCase().includes(needle) ||
          meta.name.toLowerCase().includes(needle)),
    ),
  })).filter((group) => group.items.length > 0);
});

const pageOptions = computed(() => {
  const grouped = groupStudioPages(pages.value);
  const list = [...grouped.site, ...grouped.system];
  if (
    session.activePage &&
    !list.includes(session.activePage) &&
    isStudioPageFile(session.activePage)
  ) {
    list.unshift(session.activePage);
  }
  return list.map((file) => ({ value: file, label: pageLabel(file) }));
});

const activeRowId = computed(() => {
  if (focusedRowId.value) return focusedRowId.value;
  if (selectedId.value) return selectedId.value;
  return visibleRows.value.find((row) => !row.node.locked)?.node.id ?? '';
});

// ---------------------------------------------------------------------------
// 页面样式（R-04）：检查器面板 + src/styles/pages/<slug>.css
// ---------------------------------------------------------------------------

/** 页面文件名 → 样式 slug：index、about；嵌套 index 取目录名；动态路由返回空。 */
function pageSlugOf(file: string): string {
  const normalized = file
    .replaceAll('\\', '/')
    .replace(/^src\/pages\//, '')
    .replace(/\.astro$/, '');
  const parts = normalized.split('/').filter(Boolean);
  const last = parts.at(-1) ?? '';
  const stem = last === 'index' && parts.length > 1 ? (parts.at(-2) ?? '') : last;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem) ? stem : '';
}

const pageStyleSlug = computed(() => pageSlugOf(session.activePage));
const pageStyleSupported = computed(() => Boolean(session.siteDir) && Boolean(pageStyleSlug.value));
const pageStyleUnsupportedReason = computed(() => {
  if (!session.siteDir) return '先打开一个站点，才能给单个页面写样式。';
  if (!pageStyleSlug.value) {
    return '这个页面是动态路由或路径里带特殊字符，暂时不支持页面样式；先支持 index、about 这类静态页面。';
  }
  return '';
});

function defaultPageStyle(): PageStyleState {
  return { width: '', padding: '', background: '', hideSide: false, hideToc: false };
}

function resetPageStyleDraft(): void {
  Object.assign(pageStyle, defaultPageStyle());
  pageStyleExisting.value = '';
  pageStyleExists.value = false;
  pageStyleKnown.value = true;
  pageStyleLoading.value = false;
}

function compactCssValue(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function pageStyleAttrSource(slug: string): string {
  return `body\\[data-page=(['"])${slug}\\1\\]`;
}

function normalizePageStyleSelector(selector: string, slug: string): string {
  const attr = new RegExp(`^body\\[data-page=(['"])${slug}\\1\\]`);
  return selector.trim().replace(attr, '').trim();
}

function reversePageStyleValue<T extends string>(
  values: Record<T, string>,
  compactValue: string,
): T | undefined {
  return (Object.keys(values) as T[]).find((key) => compactCssValue(values[key]) === compactValue);
}

function applyPageStyleDeclaration(
  state: PageStyleState,
  selectors: string[],
  declaration: string,
): boolean {
  const colon = declaration.indexOf(':');
  if (colon < 0) return false;
  const property = declaration.slice(0, colon).trim().toLowerCase();
  const value = compactCssValue(declaration.slice(colon + 1));
  if (!property || !value) return false;

  const isRoot = selectors.length === 1 && selectors[0] === '';
  if (isRoot) {
    if (property === '--page-width') {
      const width = reversePageStyleValue(PAGE_WIDTH_VALUES, value);
      if (!width) return false;
      state.width = width;
      return true;
    }
    if (property === '--page-padding') {
      const padding = reversePageStyleValue(PAGE_PADDING_VALUES, value);
      if (!padding) return false;
      state.padding = padding;
      return true;
    }
    if (property === '--page-bg') {
      const background = reversePageStyleValue(PAGE_BACKGROUND_VALUES, value);
      if (!background) return false;
      state.background = background;
      return true;
    }
    return false;
  }

  const hideSelectors = selectors.every(
    (selector) => selector === '.side' || selector === '.toc' || selector === '.toc-mobile',
  );
  if (!hideSelectors || selectors.length === 0) return false;
  if (property !== 'display' || value !== 'none') return false;
  for (const selector of selectors) {
    if (selector === '.side') state.hideSide = true;
    else state.hideToc = true;
  }
  return true;
}

/**
 * 解析既有页面 CSS：只认模板侧 canonical 变量与隐藏规则；
 * 出现手写规则/未知取值就标记 known=false，界面会显示只读的「现有样式」并要求二次确认后再覆盖。
 */
function parsePageStyle(css: string, slug: string): { state: PageStyleState; known: boolean } {
  const state = defaultPageStyle();
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (!source.trim()) return { state, known: true };
  const blockRe = new RegExp(`${pageStyleAttrSource(slug)}\\s*([^{}]*?)\\s*\\{([^}]*)\\}`, 'g');
  const blocks = [...source.matchAll(blockRe)];
  let known = true;
  for (const block of blocks) {
    const selectors = (block[2] ?? '')
      .split(',')
      .map((item) => normalizePageStyleSelector(item, slug));
    const declarations = (block[3] ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
    if (declarations.length === 0) {
      known = false;
      continue;
    }
    for (const declaration of declarations) {
      if (!applyPageStyleDeclaration(state, selectors, declaration)) known = false;
    }
  }
  let rest = source;
  for (const block of blocks) rest = rest.split(block[0]).join('');
  if (rest.trim()) known = false;
  return { state, known };
}

/** 生成 CSS 文本；全默认时返回空串（写入空内容等于删除该文件）。 */
function buildPageCss(slug: string, state: PageStyleState): string {
  if (!slug) return '';
  const attr = `body[data-page='${slug}']`;
  const blocks: string[] = [];
  const rootDeclarations: string[] = [];
  if (state.width) {
    rootDeclarations.push(`  --page-width: ${PAGE_WIDTH_VALUES[state.width]};`);
  }
  if (state.padding) {
    rootDeclarations.push(`  --page-padding: ${PAGE_PADDING_VALUES[state.padding]};`);
  }
  if (state.background) {
    rootDeclarations.push(`  --page-bg: ${PAGE_BACKGROUND_VALUES[state.background]};`);
  }
  if (rootDeclarations.length) {
    blocks.push(`${attr} {\n${rootDeclarations.join('\n')}\n}`);
  }
  const hideSelectors: string[] = [];
  if (state.hideSide) hideSelectors.push(`${attr} .side`);
  if (state.hideToc) hideSelectors.push(`${attr} .toc`, `${attr} .toc-mobile`);
  if (hideSelectors.length) {
    blocks.push(`${hideSelectors.join(',\n')} {\n  display: none;\n}`);
  }
  return blocks.join('\n');
}

async function loadPageStyle(force = false): Promise<void> {
  // 版式模式没有「页面样式」概念（面板也隐藏），不要拿布局 slug 去匹配站点页面 css。
  if (layoutMode.value || htmlPostMode.value) {
    styleKey = '';
    resetPageStyleDraft();
    return;
  }
  const siteDir = session.siteDir;
  const slug = pageStyleSlug.value;
  const key = `${siteDir}\u0000${slug}`;
  if (!siteDir || !slug) {
    styleKey = key;
    resetPageStyleDraft();
    return;
  }
  if (!force && key === styleKey) return;
  const token = ++styleToken;
  styleKey = key;
  pageStyleLoading.value = true;
  const result = await window.xiao.page.styleRead(siteDir, slug);
  if (token !== styleToken) return;
  pageStyleLoading.value = false;
  if (!result.ok) {
    styleKey = '';
    resetPageStyleDraft();
    notify(
      `读不到页面样式：${result.message}。可以先在面板里设置后写入，或检查 src/styles/pages 目录。`,
      'error',
      'canvas-page-style-read',
    );
    return;
  }
  pageStyleExisting.value = result.data.css;
  pageStyleExists.value = result.data.exists;
  const parsed = parsePageStyle(result.data.css, slug);
  Object.assign(pageStyle, parsed.state);
  pageStyleKnown.value = parsed.known;
}

async function savePageStyle(): Promise<void> {
  const siteDir = session.siteDir;
  const slug = pageStyleSlug.value;
  if (!siteDir || !slug || pageStyleSaving.value) return;
  const css = buildPageCss(slug, pageStyle);
  pageStyleSaving.value = true;
  session.setSaveState('saving');
  try {
    const result = css.trim()
      ? await sequenced(() => window.xiao.page.styleWrite(siteDir, slug, css))
      : await sequenced(() => window.xiao.page.styleReset(siteDir, slug));
    if (!result.ok) {
      notify(
        `页面样式没写进去：${result.message}。检查 src/styles/pages 目录后重试。`,
        'error',
        'canvas-page-style-write',
      );
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    pageStyleExisting.value = css.trim() ? `${css}\n` : '';
    pageStyleExists.value = Boolean(css.trim());
    pageStyleKnown.value = true;
    overwriteStyleOpen.value = false;
    notify(
      css.trim() ? '页面样式已写入，重新构建后生效。' : '页面样式已恢复默认，重新构建后生效。',
      'info',
      'canvas-page-style-write',
    );
  } finally {
    pageStyleSaving.value = false;
  }
}

async function resetPageStyleFile(): Promise<void> {
  const siteDir = session.siteDir;
  const slug = pageStyleSlug.value;
  if (!siteDir || !slug || pageStyleSaving.value) return;
  pageStyleSaving.value = true;
  session.setSaveState('saving');
  try {
    const result = await sequenced(() => window.xiao.page.styleReset(siteDir, slug));
    if (!result.ok) {
      notify(
        `恢复默认没成功：${result.message}。检查 src/styles/pages 目录后重试。`,
        'error',
        'canvas-page-style-reset',
      );
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    resetPageStyleDraft();
    resetStyleOpen.value = false;
    notify('页面样式已恢复默认，重新构建后生效。', 'info', 'canvas-page-style-reset');
  } finally {
    pageStyleSaving.value = false;
  }
}

function confirmOverwriteStyle(): void {
  overwriteStyleOpen.value = false;
  void savePageStyle();
}

function confirmResetStyle(): void {
  resetStyleOpen.value = false;
  void resetPageStyleFile();
}

// ---------------------------------------------------------------------------
// 读取：页面列表 / 结构 / 属性
// ---------------------------------------------------------------------------

async function loadPages(): Promise<void> {
  if (!session.siteDir) {
    pages.value = [];
    return;
  }
  const result = await window.xiao.page.list(session.siteDir);
  if (result.ok) pages.value = result.data;
  else {
    pages.value = [];
    notify(`页面列表读取失败：${result.message}`, 'error', 'canvas-pages');
  }
}

async function reload(keepId = selectedId.value): Promise<void> {
  if (!session.siteDir) {
    loading.value = false;
    return;
  }
  const token = ++reloadToken;
  loading.value = true;
  const page = session.activePage;
  const isLayout = layoutMode.value;
  const isHtml = htmlPostMode.value;
  const [outlineResult, hrefResult] = await Promise.all([
    window.xiao.canvas.outline(session.siteDir, page),
    isLayout || isHtml
      ? Promise.resolve({ ok: true as const, data: '' })
      : window.xiao.page.href(session.siteDir, page),
  ]);
  if (token !== reloadToken) return;
  loading.value = false;
  pageRoute.value = isHtml
    ? `/posts/${encodeURIComponent(htmlPostSlug.value)}/`
    : isLayout
      ? `/posts/${encodeURIComponent(layoutSlug.value)}/`
      : hrefResult.ok && hrefResult.data
        ? `/${hrefResult.data}`
        : '';
  if (!outlineResult.ok) {
    outline.value = [];
    error.value = friendlyError(outlineResult.message);
    clearSelection();
    notify(error.value, 'error', 'canvas-outline');
    return;
  }
  error.value = '';
  const next = outlineResult.data as OutlineNode[];
  const firstLoad = outline.value.length === 0;
  outline.value = next;
  if (firstLoad || expanded.value.length === 0) {
    expanded.value = flatten(next)
      .filter((row) => row.node.children.length > 0 && row.depth <= 2)
      .map((row) => row.node.id);
  }
  const keep = keepId ? findNode(next, keepId) : undefined;
  if (!keep) {
    clearSelection();
    return;
  }
  selectedId.value = keep.id;
  await syncSelectionDetails(keep);
  void focusPreview(keep.id);
}

async function loadPropSpecs(node: OutlineNode): Promise<void> {
  const token = ++propsToken;
  propsLoading.value = true;
  let specs = specCache.get(node.name);
  if (!specs) {
    const result = await window.xiao.canvas.props(node.name);
    if (token !== propsToken) return;
    if (!result.ok) {
      propsLoading.value = false;
      propSpecs.value = [];
      draft.value = {};
      notify(`读不到「${node.name}」的属性定义：${result.message}`, 'error', 'canvas-props');
      return;
    }
    specs = result.data as unknown as PropSpec[];
    specCache.set(node.name, specs);
  }
  if (token !== propsToken) return;
  propSpecs.value = specs;
  draft.value = draftFromNode(specs, node);
  propsLoading.value = false;
}

function draftFromNode(specs: PropSpec[], node: OutlineNode): Record<string, DraftValue> {
  const stored = new Map(node.props.map((prop) => [prop.name, prop.value]));
  const next: Record<string, DraftValue> = {};
  for (const spec of specs) {
    const raw = stored.get(spec.name);
    if (spec.type === 'boolean') {
      // 布尔属性不带值时（boolean-flag）在源码里表示 true。
      next[spec.name] =
        raw === undefined ? Boolean(spec.default) : !(raw === 'false' || raw === '0');
    } else if (spec.type === 'number') {
      const parsed = raw === undefined ? Number(spec.default ?? 0) : Number(raw);
      next[spec.name] = Number.isFinite(parsed) ? parsed : 0;
    } else {
      next[spec.name] = raw ?? (typeof spec.default === 'string' ? spec.default : '');
    }
  }
  return next;
}

async function syncSelectionDetails(node: OutlineNode): Promise<void> {
  if (node.kind === 'locked') {
    propSpecs.value = [];
    draft.value = {};
    textDraft.value = '';
    propsLoading.value = false;
    return;
  }
  // 正文插槽没有 manifest 属性，检查器用专门的面板说明保护规则。
  if (isSlotNode(node)) {
    propSpecs.value = [];
    draft.value = {};
    textDraft.value = '';
    propsLoading.value = false;
    return;
  }
  const textNode = node.kind === 'text' ? node : singleTextNode(node);
  textDraft.value = textNode?.text ?? '';
  if (node.kind === 'text') {
    propSpecs.value = [];
    draft.value = {};
    propsLoading.value = false;
    return;
  }
  await loadPropSpecs(node);
  if (selectedId.value === node.id) void focusPreview(node.id);
}

function singleTextNode(node: OutlineNode): OutlineNode | undefined {
  const texts = node.children.filter((child) => child.kind === 'text');
  return texts.length === 1 ? texts[0] : undefined;
}

// ---------------------------------------------------------------------------
// 选择与结构树交互
// ---------------------------------------------------------------------------

function revealNode(id: string): void {
  const row = nodeMap.value.get(id);
  if (!row) return;
  const ancestors: string[] = [];
  let parentId = row.parentId;
  while (parentId) {
    ancestors.push(parentId);
    parentId = nodeMap.value.get(parentId)?.parentId ?? null;
  }
  if (ancestors.length) expanded.value = [...new Set([...expanded.value, ...ancestors])];
  void nextTick(() => {
    document.getElementById(rowDomId(id))?.scrollIntoView({ block: 'nearest' });
  });
}

function clearSelection(): void {
  selectedId.value = '';
  propSpecs.value = [];
  draft.value = {};
  textDraft.value = '';
  propsLoading.value = false;
  void window.xiao.preview.focus('', '');
}

async function selectNode(node: OutlineNode, syncPreview = true): Promise<void> {
  if (!node) return;
  if (node.locked) {
    notify(
      '这块是模板代码（脚本、样式或表达式），搭建里不能改；去开发者模式改源码。',
      'info',
      'canvas-locked',
    );
    return;
  }
  selectedId.value = node.id;
  focusedRowId.value = node.id;
  revealNode(node.id);
  await syncSelectionDetails(node);
  if (syncPreview) void focusPreview(node.id);
}

function toggleRow(row: TreeRow): void {
  if (!row.node.children.length) return;
  expanded.value = expanded.value.includes(row.node.id)
    ? expanded.value.filter((id) => id !== row.node.id)
    : [...expanded.value, row.node.id];
}

function focusRow(id: string): void {
  document.getElementById(rowDomId(id))?.focus();
}

function nextSelectableIndex(from: number, direction: 1 | -1): number {
  const rows = visibleRows.value;
  for (let index = from + direction; index >= 0 && index < rows.length; index += direction) {
    if (!rows[index]?.node.locked) return index;
  }
  return -1;
}

function onRowKey(row: TreeRow, index: number, event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const next = nextSelectableIndex(index, event.key === 'ArrowDown' ? 1 : -1);
    if (next >= 0) {
      const target = visibleRows.value[next];
      if (target) focusRow(target.node.id);
    }
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (row.node.children.length && !isExpanded(row)) {
      expanded.value = [...expanded.value, row.node.id];
    } else if (row.node.children.length) {
      const first = visibleRows.value[index + 1];
      if (first) focusRow(first.node.id);
    }
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (row.node.children.length && isExpanded(row)) {
      toggleRow(row);
    } else if (row.parentId) {
      focusRow(row.parentId);
    }
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const target = event.key === 'Home' ? visibleRows.value[0] : visibleRows.value.at(-1);
    if (target) focusRow(target.node.id);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    void selectNode(row.node);
  }
}

// ---------------------------------------------------------------------------
// 写操作
// ---------------------------------------------------------------------------

function refreshNestRules(parentName: string): void {
  const token = ++nestToken;
  void Promise.all(
    COMPONENTS.map(async (meta) => {
      const key = `${parentName}>${meta.name}`;
      let allowed = nestCache.get(key);
      if (allowed === undefined) {
        const result = await window.xiao.canvas.canNest(parentName, meta.name);
        allowed = result.ok ? result.data : false;
        nestCache.set(key, allowed);
      }
      return { meta, allowed };
    }),
  ).then((items) => {
    if (token !== nestToken) return;
    const map: Record<string, string> = {};
    for (const item of items) {
      if (!item.allowed) map[item.meta.name] = `${parentName} 里放不下${item.meta.label}`;
    }
    blocked.value = map;
  });
}

watch(
  () => insertTarget.value?.parentName,
  (parentName) => {
    if (!parentName) {
      blocked.value = {};
      return;
    }
    refreshNestRules(parentName);
  },
  { immediate: true },
);

async function nestAllowed(parentName: string, childName: string): Promise<boolean> {
  const key = `${parentName}>${childName}`;
  const cached = nestCache.get(key);
  if (cached !== undefined) return cached;
  const result = await window.xiao.canvas.canNest(parentName, childName);
  const allowed = result.ok ? result.data : false;
  nestCache.set(key, allowed);
  return allowed;
}

function isSelfOrDescendant(id: string, ancestorId: string): boolean {
  if (id === ancestorId) return true;
  let parentId = nodeMap.value.get(id)?.parentId ?? null;
  while (parentId) {
    if (parentId === ancestorId) return true;
    parentId = nodeMap.value.get(parentId)?.parentId ?? null;
  }
  return false;
}

function hitToInsert(hit: StageHit): InsertTarget | null {
  const file = hit.file.replaceAll('\\', '/');
  const current = session.activePage.replaceAll('\\', '/');
  if (file !== current) return null;
  const row = nodeMap.value.get(hit.offset);
  if (!row) return insertTarget.value;
  if (hit.place === 'into' && row.container) {
    return {
      parentId: row.node.id,
      parentName: row.node.name,
      index: row.node.children.length,
      label: `${labelOfNode(row.node)} 内部`,
    };
  }
  const parent = row.parentId ? nodeMap.value.get(row.parentId) : undefined;
  if (!parent) return insertTarget.value;
  return {
    parentId: parent.node.id,
    parentName: parent.node.name,
    index: hit.place === 'before' ? row.index : row.index + 1,
    label: `${labelOfNode(parent.node)} · ${labelOfNode(row.node)} ${hit.place === 'before' ? '之前' : '之后'}`,
  };
}

async function insertComponent(meta: ComponentMeta, at?: InsertTarget | null): Promise<void> {
  const target = at ?? insertTarget.value;
  if (!target || busy.value || insertPending.value || !session.siteDir) return;
  const allowed = await nestAllowed(target.parentName, meta.name);
  if (!allowed) {
    notify(
      `${target.parentName} 里放不下${meta.label}；换一个容器再试。`,
      'error',
      'canvas-insert-blocked',
    );
    return;
  }
  const parentPath = pathOf(outline.value, target.parentId);
  busy.value = true;
  insertPending.value = meta.name;
  session.setSaveState('saving');
  try {
    const result = await sequenced(() =>
      window.xiao.canvas.insert(
        session.siteDir,
        target.parentId,
        target.index,
        meta.name,
        session.activePage,
      ),
    );
    if (!result.ok) {
      notify(
        `没能放入${meta.label}：${result.message}。换一个容器再试，或去开发者模式手动改源码。`,
        'error',
        'canvas-insert',
      );
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    await reload('');
    const parentNode = parentPath !== null ? atPath(outline.value, parentPath) : undefined;
    const inserted = parentNode?.children[target.index];
    if (inserted) await selectNode(inserted);
    notify(`已放入${meta.label}`, 'info', 'canvas-insert');
  } finally {
    busy.value = false;
    insertPending.value = '';
  }
}

async function moveNode(id: string, at: InsertTarget): Promise<void> {
  if (!session.siteDir || busy.value) return;
  if (isSelfOrDescendant(at.parentId, id)) {
    notify('不能把容器拖进它自己里面。', 'error', 'canvas-move');
    return;
  }
  const row = nodeMap.value.get(id);
  if (!row || row.node.locked) return;
  const allowed = await nestAllowed(at.parentName, row.node.name);
  if (!allowed) {
    notify(`${at.parentName} 里放不下${labelOfNode(row.node)}。`, 'error', 'canvas-move');
    return;
  }
  busy.value = true;
  session.setSaveState('saving');
  try {
    const result = await sequenced(() =>
      window.xiao.canvas.move(session.siteDir, id, at.parentId, at.index, session.activePage),
    );
    if (!result.ok) {
      notify(`没能移动：${result.message}`, 'error', 'canvas-move');
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    await reload(id);
    notify('已调整位置', 'info', 'canvas-move');
  } finally {
    busy.value = false;
  }
}

function setDraft(spec: PropSpec, value: DraftValue): void {
  draft.value = { ...draft.value, [spec.name]: value };
}

function commitProp(spec: PropSpec, value: DraftValue): void {
  const node = selectedNode.value;
  if (!node || node.kind === 'text' || node.kind === 'locked' || !session.siteDir) return;
  if (spec.type === 'list') return;
  setDraft(spec, value);
  void sequenced(async () => {
    session.setSaveState('saving');
    const result = await window.xiao.canvas.setProp(
      session.siteDir,
      node.id,
      spec.name,
      value,
      session.activePage,
    );
    if (!result.ok) {
      notify(
        `${spec.label}没写进去：${result.message}。改回原值再试，或去开发者模式改源码。`,
        'error',
        'canvas-prop',
      );
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    await reload(node.id);
  });
}

function resetProp(spec: PropSpec): void {
  commitProp(spec, convertDefault(spec));
}

async function readHtmlChrome(): Promise<void> {
  if (!htmlPostMode.value || !session.siteDir) {
    htmlStandalone.value = false;
    return;
  }
  const result = await window.xiao.dev.read(session.siteDir, session.activePage);
  htmlStandalone.value = result.ok && /^standalone:[ \t]*true[ \t]*$/m.test(result.data);
}

async function setHtmlChrome(standalone: boolean): Promise<void> {
  if (!htmlPostMode.value || !session.siteDir || standalone === htmlStandalone.value) return;
  const result = await window.xiao.dev.read(session.siteDir, session.activePage);
  if (!result.ok) {
    notify(`没能读取这篇文章：${result.message}`, 'error', 'html-chrome');
    return;
  }
  const source = result.data.replace(/\r\n/g, '\n');
  const line = `standalone: ${standalone ? 'true' : 'false'}`;
  let next = source;
  if (/^standalone:[ \t]*(true|false)[ \t]*$/m.test(source)) {
    next = source.replace(/^standalone:[ \t]*(true|false)[ \t]*$/m, line);
  } else {
    const close = source.indexOf('\n---', 3);
    if (close < 0) {
      notify('这篇 HTML 没有头部，没法切换成独立页面。', 'error', 'html-chrome');
      return;
    }
    next = `${source.slice(0, close)}\n${line}${source.slice(close)}`;
  }
  const written = await window.xiao.dev.write(session.siteDir, session.activePage, next);
  if (!written.ok) {
    notify(`没能切换页面形态：${written.message}`, 'error', 'html-chrome');
    return;
  }
  htmlStandalone.value = standalone;
}

function commitPreviewText(payload: { file: string; offset: string; text: string }): void {
  if (!htmlPostMode.value || !session.siteDir) return;
  const file = payload.file.replaceAll('\\', '/');
  if (file !== session.activePage.replaceAll('\\', '/')) return;
  const row = nodeMap.value.get(payload.offset);
  if (!row) return;
  const target = row.node.kind === 'text' ? row.node : singleTextNode(row.node);
  if (!target || target.text === payload.text) return;
  void sequenced(async () => {
    session.setSaveState('saving');
    const result = await window.xiao.canvas.setText(
      session.siteDir,
      target.id,
      payload.text,
      session.activePage,
    );
    if (!result.ok) {
      notify(`文字没写进去：${result.message}。在页面上再改一次。`, 'error', 'canvas-text');
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    await reload(row.node.id);
  });
}

function commitText(): void {
  const node = selectedNode.value;
  if (!node || !session.siteDir) return;
  const target = node.kind === 'text' ? node : singleTextNode(node);
  if (!target) return;
  if (textDraft.value === target.text) return;
  const parentId = node.id;
  void sequenced(async () => {
    session.setSaveState('saving');
    const result = await window.xiao.canvas.setText(
      session.siteDir,
      target.id,
      textDraft.value,
      session.activePage,
    );
    if (!result.ok) {
      notify(`文字没写进去：${result.message}。改回原值再试。`, 'error', 'canvas-text');
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    await reload(parentId);
  });
}

async function history(kind: 'undo' | 'redo'): Promise<void> {
  if (!session.siteDir || busy.value) return;
  busy.value = true;
  session.setSaveState('saving');
  try {
    const result = await sequenced(() =>
      kind === 'undo'
        ? window.xiao.canvas.undo(session.siteDir, session.activePage)
        : window.xiao.canvas.redo(session.siteDir, session.activePage),
    );
    if (!result.ok) {
      notify(
        `${kind === 'undo' ? '撤销' : '重做'}没成功：${result.message}`,
        'error',
        'canvas-history',
      );
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    await reload(selectedId.value);
    notify(kind === 'undo' ? '已撤销' : '已重做', 'info', 'canvas-history');
  } finally {
    busy.value = false;
  }
}

async function createPage(): Promise<void> {
  const slug = newSlug.value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    notify('页面地址只用小写字母、数字和连字符，例如 about。', 'error', 'canvas-page-slug');
    return;
  }
  if (!session.siteDir || creating.value) return;
  creating.value = true;
  session.setSaveState('saving');
  try {
    const result = await sequenced(() =>
      window.xiao.page.create(session.siteDir, newTemplate.value, slug),
    );
    if (!result.ok) {
      notify(
        `没能新建页面：${result.message}。换个地址或检查站点目录后重试。`,
        'error',
        'canvas-page-create',
      );
      session.setSaveState('dirty');
      return;
    }
    session.setSaveState('saved');
    newSlug.value = '';
    await loadPages();
    session.setPage(result.data);
    notify(`已新建 ${result.data}`, 'info', 'canvas-page-create');
  } finally {
    creating.value = false;
  }
}

function openSource(): void {
  void enterSource();
}

async function enterSource(): Promise<void> {
  if (sourceMode.value || !session.siteDir || !session.activePage) return;
  sourceMode.value = true;
  session.setWorkbenchSource(true);
  await nextTick();
  await mountPageSource();
}

async function enterVisual(): Promise<void> {
  if (!sourceMode.value) return;
  await flushSource();
  disposeSource();
  sourceMode.value = false;
  session.setWorkbenchSource(false);
  await reload();
  void nextTick(syncStage);
}

function disposeSource(): void {
  window.clearTimeout(sourceTimer);
  sourceTimer = 0;
  sourceEditor?.dispose();
  sourceEditor = undefined;
  sourceModel?.dispose();
  sourceModel = undefined;
}

async function mountPageSource(): Promise<void> {
  const gen = ++sourceGen;
  const file = session.activePage;
  const dir = session.siteDir;
  if (!dir || !file) return;
  const result = await window.xiao.dev.read(dir, file);
  if (gen !== sourceGen) return;
  if (!result.ok) {
    notify(`没能打开源码：${result.message}。`, 'error', 'canvas-source');
    sourceMode.value = false;
    session.setWorkbenchSource(false);
    return;
  }
  disposeSource();
  await nextTick();
  if (gen !== sourceGen) return;
  const host = sourceRoot.value;
  if (!host) return;
  const model = monaco.editor.createModel(result.data, 'html');
  sourceModel = model;
  sourceSaved = result.data;
  sourceEditor = monaco.editor.create(host, {
    model,
    automaticLayout: true,
    wordWrap: 'on',
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    padding: { top: 16, bottom: 48 },
    theme: session.theme === 'dark' ? 'vs-dark' : 'vs',
  });
  model.onDidChangeContent(() => {
    if (model.getValue() === sourceSaved) {
      session.setSaveState('saved');
      return;
    }
    session.setSaveState('dirty');
    window.clearTimeout(sourceTimer);
    sourceTimer = window.setTimeout(() => {
      sourceTimer = 0;
      void flushSource();
    }, 800);
  });
  sourceEditor.layout();
  sourceEditor.focus();
}

async function flushSource(): Promise<void> {
  window.clearTimeout(sourceTimer);
  sourceTimer = 0;
  if (!sourceEditor || !session.siteDir || !session.activePage) return;
  const text = sourceEditor.getValue();
  if (text === sourceSaved) {
    session.setSaveState('saved');
    return;
  }
  session.setSaveState('saving');
  const result = await window.xiao.dev.write(session.siteDir, session.activePage, text);
  if (!result.ok) {
    session.setSaveState('dirty');
    notify(`源码没能保存：${result.message}。`, 'error', 'canvas-source');
    return;
  }
  sourceSaved = text;
  session.setSaveState('saved');
}

function switchPage(value: string | number): void {
  const file = String(value);
  if (!file || file === session.activePage) return;
  session.setPage(file);
}

/** 版式模式专属：回到正在写的那篇文章（Shell 的文章选择状态还在，一般能直接回到编辑器）。 */
function backToWriting(): void {
  session.closeLayout();
  session.setNav('posts');
  notify('已回到写作视图', 'info', 'canvas-layout-back');
}

// ---------------------------------------------------------------------------
// 预览联动
// ---------------------------------------------------------------------------

function stagePreviewUrl(): string {
  const base = session.previewUrl;
  if (!base) return '';
  const root = base.endsWith('/') ? base : `${base}/`;
  if (htmlPostMode.value && htmlPostSlug.value) {
    return new URL(`posts/${encodeURIComponent(htmlPostSlug.value)}/`, root).href;
  }
  if (layoutMode.value && layoutSlug.value) {
    return new URL(`posts/${encodeURIComponent(layoutSlug.value)}/`, root).href;
  }
  if (!pageRoute.value) return root;
  return new URL(pageRoute.value, root).href;
}

const stageLive = computed(
  () =>
    Boolean(session.previewUrl) &&
    canvasHoldsPreview() &&
    !htmlPostMode.value &&
    !session.chromeOpen &&
    !overwriteStyleOpen.value &&
    !resetStyleOpen.value,
);

function syncStage(): void {
  const hole = boardEl.value;
  if (!hole || !stageLive.value) {
    void window.xiao.preview.hideDock();
    return;
  }
  const url = stagePreviewUrl();
  if (!url) {
    void window.xiao.preview.hideDock();
    return;
  }
  cancelAnimationFrame(stageFrame);
  stageFrame = requestAnimationFrame(() => {
    const bounds = clipStageBounds(hole);
    if (!bounds) {
      void window.xiao.preview.hideDock();
      return;
    }
    const device =
      session.previewDevice === 'phone' ||
      session.previewDevice === 'tablet' ||
      session.previewDevice === 'side'
        ? session.previewDevice
        : 'pc';
    void window.xiao.preview.dock({
      enabled: true,
      url,
      device,
      zoom: stageZoom.value,
      bounds,
    });
  });
}

/** 原生预览层永远压在网页上面，所以先裁到画布洞里，再让开检查器、底栏和状态栏。 */
function clipStageBounds(
  hole: HTMLElement,
): { x: number; y: number; width: number; height: number } | null {
  const rect = hole.getBoundingClientRect();
  let right = Math.min(rect.right, window.innerWidth);
  let bottom = Math.min(rect.bottom, window.innerHeight);
  const block = (selector: string, edge: 'left' | 'top') => {
    const el = document.querySelector(selector);
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    if (edge === 'left') right = Math.min(right, box.left);
    else bottom = Math.min(bottom, box.top);
  };
  block('aside.inspector', 'left');
  block('footer.status', 'top');
  block('.stage-foot', 'top');
  const x = Math.round(rect.left);
  const y = Math.round(rect.top);
  const width = Math.floor(right - rect.left);
  const height = Math.floor(bottom - rect.top);
  if (width < 120 || height < 120) return null;
  return { x, y, width, height };
}

function openArticlePreview(): void {
  const slug = htmlPostSlug.value || layoutSlug.value;
  if (!slug) return;
  window.dispatchEvent(
    new CustomEvent('xiao:preview-window', {
      detail: { path: `posts/${encodeURIComponent(slug)}/` },
    }),
  );
}

async function ensurePreview(): Promise<void> {
  if (!session.siteDir || session.building) return;
  if (session.previewUrl && session.previewSiteDir === session.siteDir) {
    void nextTick(syncStage);
    return;
  }
  session.building = true;
  const result = await window.xiao.runtime.start('dev', session.siteDir);
  if (!result.ok) {
    session.building = false;
    notify(
      `没能打开页面：${result.message}。先确认站点依赖已经装好。`,
      'error',
      'canvas-preview',
    );
  }
}

function selectedHandles(): { width: boolean; pad: boolean } {
  const names = new Set(propSpecs.value.map((spec) => spec.name));
  return { width: names.has('width'), pad: names.has('pad') };
}

async function focusPreview(id: string): Promise<void> {
  if (!session.previewUrl) return;
  const node = findNode(outline.value, id);
  const label = node ? labelOfNode(node) : '';
  try {
    await window.xiao.preview.focus(session.activePage, id, label, selectedHandles());
  } catch {
    // 预览未挂上时忽略。
  }
}

const WIDTH_PX: Record<string, number> = { narrow: 560, prose: 720, wide: 1200, full: 1600 };
const PAD_PX: Record<string, number> = { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 40, '2xl': 64 };

function snapToken(px: number, table: Record<string, number>, allowed: string[]): string {
  let best = allowed[0] ?? '';
  let bestDelta = Infinity;
  for (const value of allowed) {
    const size = table[value];
    if (size == null) continue;
    const delta = Math.abs(size - px);
    if (delta < bestDelta) {
      best = value;
      bestDelta = delta;
    }
  }
  return best;
}

function onPreviewResize(payload: { prop: 'width' | 'pad'; px: number }): void {
  const spec = propSpecs.value.find((item) => item.name === payload.prop);
  if (!spec || spec.type !== 'enum' || !spec.options?.length) return;
  const allowed = spec.options.map((item) => item.value);
  const next =
    payload.prop === 'width'
      ? snapToken(payload.px, WIDTH_PX, allowed)
      : snapToken(payload.px, PAD_PX, allowed);
  if (!next || String(draft.value[spec.name] ?? '') === next) return;
  commitProp(spec, next);
}

function onPreviewCamera(payload: { zoom: number }): void {
  if (typeof payload.zoom === 'number') stageZoom.value = payload.zoom;
}

async function setStageZoom(next: number): Promise<void> {
  stageZoom.value = Math.min(2, Math.max(0.5, Math.round(next * 20) / 20));
  await window.xiao.preview.zoom(stageZoom.value);
}

function armDrag(event: PointerEvent, payload: DragKind): void {
  if (event.button !== 0 || busy.value) return;
  dragArmed = { x: event.clientX, y: event.clientY, payload };
}

async function updateDrag(event: PointerEvent): Promise<void> {
  if (!dragArmed && !dragActive) return;
  if (dragArmed && !dragActive) {
    const dx = event.clientX - dragArmed.x;
    const dy = event.clientY - dragArmed.y;
    if (dx * dx + dy * dy < 36) return;
    dragActive = dragArmed.payload;
    skipPaletteClick = dragActive.kind === 'new';
    session.setDrag({
      kind: dragActive.kind,
      name: dragActive.name,
      id: dragActive.kind === 'move' ? dragActive.id : '',
    });
  }
  if (!dragActive) return;
  dragGhost.value = { label: dragActive.label, x: event.clientX, y: event.clientY };
  cancelAnimationFrame(hitFrame);
  hitFrame = requestAnimationFrame(() => {
    void window.xiao.preview.hit(event.clientX, event.clientY).then((result) => {
      lastHit = result.ok ? result.data : null;
      dropLabel.value = lastHit ? (hitToInsert(lastHit)?.label ?? '') : '';
      void window.xiao.preview.drop(lastHit);
    });
  });
}

async function finishDrag(): Promise<void> {
  const payload = dragActive;
  const hit = lastHit;
  dragArmed = null;
  dragActive = null;
  lastHit = null;
  dragGhost.value = null;
  dropLabel.value = '';
  session.setDrag(null);
  void window.xiao.preview.drop(null);
  if (!payload) return;
  const at = hit ? hitToInsert(hit) : insertTarget.value;
  if (!at) return;
  if (payload.kind === 'new') {
    const meta = COMPONENTS.find((item) => item.name === payload.name);
    if (meta) await insertComponent(meta, at);
    return;
  }
  await moveNode(payload.id, at);
}

const htmlCatalog = computed(() =>
  COMPONENTS.filter((meta) => meta.category !== 'blog').map((meta) => ({
    name: meta.name,
    label: meta.label,
    category: meta.category,
  })),
);
const htmlSide = ref<'block' | 'doc'>('block');
const htmlInspector = computed(() => {
  if (!htmlPostMode.value) return selectedId.value ? 'block' : 'page';
  if (htmlSide.value === 'doc') return 'page';
  return selectedId.value ? 'block' : 'empty';
});

function onHtmlSelect(id: string): void {
  htmlSide.value = 'block';
  const row = nodeMap.value.get(id);
  if (row) void selectNode(row.node, false);
}

async function onHtmlRemove(id: string): void {
  if (!session.siteDir || !id) return;
  const result = await window.xiao.canvas.remove(session.siteDir, id, session.activePage);
  if (!result.ok) {
    notify(`没能删除区块：${result.message}`, 'error', 'canvas-remove');
    return;
  }
  if (selectedId.value === id) clearSelection();
  await reload('');
}

async function onHtmlDuplicate(id: string): void {
  if (!session.siteDir || !id) return;
  const result = await window.xiao.canvas.duplicate(session.siteDir, id, session.activePage);
  if (!result.ok) {
    notify(`没能复制区块：${result.message}`, 'error', 'canvas-duplicate');
    return;
  }
  await reload(id);
}

async function onHtmlReplace(payload: {
  id: string;
  parentId: string;
  parentName: string;
  index: number;
  name: string;
}): Promise<void> {
  await onHtmlRemove(payload.id);
  onHtmlInsert(payload);
}

function onHtmlInsert(payload: {
  parentId: string;
  parentName: string;
  index: number;
  name: string;
}): void {
  const meta = COMPONENTS.find((item) => item.name === payload.name);
  if (!meta) return;
  void insertComponent(meta, {
    parentId: payload.parentId,
    parentName: payload.parentName,
    index: payload.index,
    label: meta.label,
  });
}

function onHtmlMove(payload: {
  id: string;
  parentId: string;
  parentName: string;
  index: number;
}): void {
  void moveNode(payload.id, {
    parentId: payload.parentId,
    parentName: payload.parentName,
    index: payload.index,
    label: '',
  });
}

function onHtmlText(payload: { id: string; text: string }): void {
  commitPreviewText({ file: session.activePage, offset: payload.id, text: payload.text });
}

function pushBlockCatalog(): void {
  const items = htmlPostMode.value
    ? COMPONENTS.filter((meta) => meta.category !== 'blog').map((meta) => ({
        name: meta.name,
        label: meta.label,
      }))
    : [];
  window.xiao.preview.catalog(items);
}

function onPreviewInsert(payload: {
  file: string;
  offset: string;
  name: string;
  place: 'before' | 'after' | 'into';
}): void {
  if (!htmlPostMode.value) return;
  const meta = COMPONENTS.find((item) => item.name === payload.name);
  if (!meta) return;
  const at = hitToInsert({ ...payload, tag: 'div' });
  void insertComponent(meta, at);
}

function onPaletteClick(meta: ComponentMeta): void {
  if (skipPaletteClick) {
    skipPaletteClick = false;
    return;
  }
  void insertComponent(meta);
}

function onPalettePointerDown(event: PointerEvent, meta: ComponentMeta): void {
  armDrag(event, { kind: 'new', name: meta.name, label: meta.label });
}

function onTreePointerDown(event: PointerEvent, row: TreeRow): void {
  if (row.node.locked) return;
  armDrag(event, {
    kind: 'move',
    id: row.node.id,
    name: row.node.name,
    label: labelOfNode(row.node),
  });
}

function onWindowPointerMove(event: PointerEvent): void {
  void updateDrag(event);
}

function onWindowPointerUp(): void {
  void finishDrag();
}

async function onPreviewPick(payload: { file: string; offset: string }): Promise<void> {
  const file = payload.file.replaceAll('\\', '/');
  const current = session.activePage.replaceAll('\\', '/');
  if (file !== current) {
    const htmlArticle = current.includes('/content/posts/') && current.endsWith('/index.html');
    const fromLayout = file.includes('/layouts/') && file.endsWith('.astro');
    notify(
      htmlArticle && fromLayout
        ? '点到的是站点版式（标题、页眉、页脚），不是这篇文章的正文。点正文里的段落或区块才能改。'
        : `选中的元素来自 ${file}，当前只编辑页面文件 ${current}；页面文件里的元素才能在这里选中。`,
      'info',
      'canvas-pick-file',
    );
    return;
  }
  let row = nodeMap.value.get(payload.offset);
  if (!row) {
    await reload(selectedId.value);
    row = nodeMap.value.get(payload.offset);
  }
  if (!row) {
    notify(
      '没在结构里找到这个元素，可能来自布局或模板代码；点刷新结构重试。',
      'error',
      'canvas-pick-miss',
    );
    return;
  }
  if (row.node.locked) {
    notify('这块是模板代码，不能在搭建里改；去开发者模式改源码。', 'info', 'canvas-pick-lock');
    return;
  }
  await selectNode(row.node, true);
}

// ---------------------------------------------------------------------------
// 生命周期
// ---------------------------------------------------------------------------

function checkInspectorHost(): void {
  hostReady.value = Boolean(document.getElementById('inspector-host'));
}

function onCanvasRefresh(event: Event): void {
  const detail = (event as CustomEvent<string>).detail;
  if (typeof detail === 'string' && detail) notify(detail, 'info', 'canvas-sync');
  if (sourceMode.value) return;
  void reload(selectedId.value);
}

function onSaveRequest(): void {
  if (!session.siteDir) return;
  if (sourceMode.value) {
    void flushSource();
    return;
  }
  void reload(selectedId.value);
}

watch(
  () => session.activePage,
  (file, previous) => {
    // 离开版式文件时清掉「正在编辑哪篇版式」的元数据，避免标题/预览残留。
    if (!layoutSlugOf(file)) session.closeLayout();
    expanded.value = [];
    clearSelection();
    const enterHtml = Boolean(htmlPostSlugOf(file)) && !htmlPostSlugOf(previous ?? '');
    if (enterHtml && sourceMode.value) {
      sourceMode.value = false;
      session.setWorkbenchSource(false);
      disposeSource();
      void reload('');
      return;
    }
    if (sourceMode.value) {
      void (async () => {
        await flushSource();
        disposeSource();
        await mountPageSource();
      })();
      return;
    }
    void reload('');
  },
);

// 进入文章版式时自动把真页面铺到舞台上，显示 /posts/<slug>/。
watch([layoutMode, htmlPostMode], ([layout, html]) => {
  pushBlockCatalog();
  if (html) void readHtmlChrome();
  if (html && collapsedListForStage.value) {
    session.listCollapsed = false;
    collapsedListForStage.value = false;
  }
  if (!layout && !html) return;
  void ensurePreview();
  void nextTick(syncStage);
});

watch(
  () => session.siteDir,
  () => {
    expanded.value = [];
    clearSelection();
    void loadPages();
    void reload('');
  },
);

watch(
  () => session.inspectorOpen,
  () => {
    void nextTick(checkInspectorHost);
  },
);

// 没选中组件时展示页面样式面板；切页 / 取消选中时读回该页 CSS。
watch(
  () => [session.siteDir, session.activePage, selectedId.value] as const,
  () => {
    if (selectedId.value) return;
    void loadPageStyle();
  },
);

watch(
  () =>
    [
      session.previewUrl,
      session.previewDevice,
      sourceMode.value,
      session.chromeOpen,
      session.activePage,
      pageRoute.value,
      overwriteStyleOpen.value,
      resetStyleOpen.value,
      layersCollapsed.value,
      stageZoom.value,
    ] as const,
  () => {
    void nextTick(syncStage);
  },
);

watch(boardEl, (el) => {
  stageObserver?.disconnect();
  if (!el) return;
  stageObserver = new ResizeObserver(() => syncStage());
  stageObserver.observe(el);
  syncStage();
});

onMounted(() => {
  checkInspectorHost();
  window.addEventListener('xiao-canvas', onCanvasRefresh);
  window.addEventListener('xiao:save', onSaveRequest);
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp);
  stopPick = window.xiao.preview.onPick((payload) => {
    void onPreviewPick(payload);
  });
  stopInsert = window.xiao.preview.onInsertBlock(onPreviewInsert);
  stopText = window.xiao.preview.onText((payload) => {
    void commitPreviewText(payload);
  });
  pushBlockCatalog();
  void readHtmlChrome();
  stopResize = window.xiao.preview.onResize(onPreviewResize);
  stopCamera = window.xiao.preview.onCamera(onPreviewCamera);
  if (session.nav === 'pages' && !session.listCollapsed) {
    session.listCollapsed = true;
    collapsedListForStage.value = true;
  }
  void loadPages();
  void reload();
  void loadPageStyle();
  void ensurePreview().then(() => nextTick(syncStage));
});

watch(
  () => session.theme,
  () => {
    monaco.editor.setTheme(session.theme === 'dark' ? 'vs-dark' : 'vs');
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('xiao-canvas', onCanvasRefresh);
  window.removeEventListener('xiao:save', onSaveRequest);
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
  stopPick();
  stopInsert();
  stopText();
  stopResize();
  stopCamera();
  stageObserver?.disconnect();
  cancelAnimationFrame(stageFrame);
  void flushSource();
  disposeSource();
  session.setWorkbenchSource(false);
  if (collapsedListForStage.value) session.listCollapsed = false;
  void window.xiao.preview.hideDock();
});
</script>

<template>
  <div class="canvas-view" :class="{ 'is-source': sourceMode, 'is-html': htmlPostMode }">
    <WorkbenchBar
      v-model:mode="workbenchMode"
      :badge="kindBadge"
      :badge-tone="htmlPostMode || layoutMode || isSystemPage(session.activePage) ? 'accent' : 'neutral'"
      @save="onSaveRequest"
    >
      <UiSegmented
        v-if="htmlPostMode"
        v-model="htmlChromeKey"
        :items="htmlChromeItems"
        aria-label="HTML 文章怎么放进站点"
      />
      <UiTooltip v-if="htmlPostMode || layoutMode" label="在预览窗口打开这篇文章">
        <UiButton
          variant="primary"
          :icon="icons.preview"
          aria-label="在预览窗口打开这篇文章"
          @click="openArticlePreview"
        >
          <span class="bar-label">预览</span>
        </UiButton>
      </UiTooltip>
      <template v-if="!sourceMode">
        <span class="zoom-read">{{ Math.round(stageZoom * 100) }}%</span>
        <UiTooltip label="缩小">
          <UiButton variant="ghost" size="sm" aria-label="缩小" @click="setStageZoom(stageZoom - 0.1)">
            −
          </UiButton>
        </UiTooltip>
        <UiTooltip label="100%">
          <UiButton variant="ghost" size="sm" aria-label="重置缩放" @click="setStageZoom(1)">
            1:1
          </UiButton>
        </UiTooltip>
        <UiTooltip label="放大">
          <UiButton variant="ghost" size="sm" aria-label="放大" @click="setStageZoom(stageZoom + 0.1)">
            +
          </UiButton>
        </UiTooltip>
        <UiTooltip label="撤销（按页面文件）">
          <UiButton
            variant="ghost"
            size="sm"
            :icon="mdiUndo"
            aria-label="撤销"
            :disabled="busy"
            @click="history('undo')"
          />
        </UiTooltip>
        <UiTooltip label="重做（按页面文件）">
          <UiButton
            variant="ghost"
            size="sm"
            :icon="mdiRedo"
            aria-label="重做"
            :disabled="busy"
            @click="history('redo')"
          />
        </UiTooltip>
        <UiTooltip label="从磁盘重新读取结构">
          <UiButton
            variant="ghost"
            size="sm"
            :icon="icons.refresh"
            aria-label="刷新结构"
            :loading="loading"
            @click="reload()"
          />
        </UiTooltip>
      </template>
    </WorkbenchBar>
    <div class="canvas-body">
    <aside v-show="!sourceMode && !htmlPostMode" class="palette" aria-label="组件面板">
      <div class="palette-head">
        <UiInput
          v-model="search"
          size="sm"
          :icon="icons.seo"
          placeholder="搜索组件"
          aria-label="搜索组件"
        />
      </div>
      <div class="palette-scroll">
        <div v-for="group in filteredGroups" :key="group.category" class="palette-group">
          <p class="palette-group__title">
            <UiIcon :path="group.icon" :size="13" />
            <span>{{ group.label }}</span>
            <span class="palette-group__count">{{ group.items.length }}</span>
          </p>
          <div class="palette-list">
            <button
              v-for="meta in group.items"
              :key="meta.name"
              type="button"
              class="palette-item"
              :disabled="busy || Boolean(insertPending)"
              :title="
                insertTarget
                  ? `放入${insertTarget.label}，也可拖到页面上`
                  : '拖到页面上，或先选中一个容器'
              "
              @pointerdown="onPalettePointerDown($event, meta)"
              @click="onPaletteClick(meta)"
            >
              <span class="palette-item__icon">
                <UiIcon :path="CATEGORY_ICON[meta.category]" :size="16" />
              </span>
              <span class="palette-item__text">
                <span class="palette-item__label">{{ meta.label }}</span>
                <span class="palette-item__hint">{{ paletteHint(meta) }}</span>
              </span>
              <UiSpinner
                v-if="insertPending === meta.name"
                :size="12"
                :label="null"
                class="palette-item__spinner"
              />
            </button>
          </div>
        </div>
        <UiEmpty
          v-if="filteredGroups.length === 0"
          title="没找到组件"
          description="换个关键词，例如「区块」「图片」「文章」。"
          :icon="icons.seo"
        />
      </div>
      <div class="palette-foot">
        <UiIcon :path="icons.plus" :size="13" />
        <span v-if="insertTarget">插入到：{{ insertTarget.label }}</span>
        <span v-else>先选中一个容器，或点「刷新结构」。</span>
      </div>
    </aside>

    <section class="stage" aria-label="页面结构">
      <header v-show="!sourceMode" class="stage-bar">
        <div class="stage-bar__left">
          <template v-if="htmlPostMode">
            <UiBadge tone="accent" size="sm">HTML 文章</UiBadge>
            <span class="stage-title">{{ htmlPostSlug }}</span>
          </template>
          <template v-else-if="layoutMode">
            <UiButton variant="ghost" size="sm" :icon-left="icons.back" @click="backToWriting">
              返回写作
            </UiButton>
            <UiBadge tone="accent" size="sm">文章版式</UiBadge>
            <span class="stage-title" :title="layoutTitle || layoutSlug">
              {{ layoutTitle || layoutSlug }}
            </span>
          </template>
          <template v-else>
            <UiIcon class="stage-bar__page-icon" :path="icons.files" :size="15" />
            <div class="page-select">
              <UiSelect
                :model-value="session.activePage"
                :options="pageOptions"
                size="sm"
                aria-label="选择页面"
                @update:model-value="switchPage"
              />
            </div>
          </template>
          <UiBadge v-if="pageRoute" class="stage-route" tone="neutral" size="sm">
            {{ pageRoute }}
          </UiBadge>
        </div>
      </header>

      <div v-show="sourceMode" ref="sourceRoot" class="page-source" />
      <div v-show="!sourceMode" class="stage-body" :class="{ 'layers-collapsed': layersCollapsed }">
        <aside v-if="!htmlPostMode" class="layers" aria-label="结构">
          <header class="layers-head">
            <template v-if="!layersCollapsed">
              <UiIcon :path="icons.layers" :size="13" />
              <span>结构</span>
              <UiTooltip label="收起结构">
                <UiButton
                  variant="ghost"
                  size="sm"
                  :icon="icons.chevronLeft"
                  aria-label="收起结构"
                  @click="layersCollapsed = true"
                />
              </UiTooltip>
            </template>
            <UiTooltip v-else label="展开结构">
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.layers"
                aria-label="展开结构"
                @click="layersCollapsed = false"
              />
            </UiTooltip>
          </header>
          <div v-show="!layersCollapsed" class="layers-body">
            <div v-if="loading && !outline.length" class="stage-state">
              <UiSpinner :size="20" />
              <p>正在读取结构…</p>
            </div>
            <UiEmpty v-else-if="error" title="读不到结构" :description="error" :icon="icons.alert">
              <template #action>
                <UiButton size="sm" @click="reload()">刷新</UiButton>
              </template>
            </UiEmpty>
            <UiEmpty
              v-else-if="!outline.length"
              title="这页还是空的"
              description="插入组件，或去源码里加根布局。"
              :icon="icons.pages"
            />
            <div v-else class="outline-tree" role="tree" aria-label="页面结构">
              <template v-for="(row, index) in visibleRows" :key="row.node.id">
                <div
                  :id="rowDomId(row.node.id)"
                  class="tree-row"
                  :class="{
                    'is-selected': row.node.id === selectedId,
                    'is-locked': row.node.locked,
                    'is-container': row.container,
                    'is-slot': isSlotNode(row.node),
                  }"
                  role="treeitem"
                  :aria-level="row.depth + 1"
                  :aria-selected="row.node.id === selectedId"
                  :aria-expanded="row.node.children.length ? isExpanded(row) : undefined"
                  :aria-disabled="row.node.locked || undefined"
                  :tabindex="row.node.locked ? -1 : row.node.id === activeRowId ? 0 : -1"
                  :data-node-id="row.node.id"
                  :style="{ paddingLeft: `calc(var(--ui-s2) + ${row.depth * 12}px)` }"
                  @focus="focusedRowId = row.node.id"
                  @pointerdown="onTreePointerDown($event, row)"
                  @click="selectNode(row.node)"
                  @dblclick="toggleRow(row)"
                  @keydown="onRowKey(row, index, $event)"
                >
                  <button
                    v-if="row.node.children.length"
                    type="button"
                    class="tree-row__caret"
                    tabindex="-1"
                    :aria-label="isExpanded(row) ? '收起' : '展开'"
                    @click.stop="toggleRow(row)"
                    @dblclick.stop
                  >
                    <UiIcon
                      :path="isExpanded(row) ? icons.chevronDown : icons.chevronRight"
                      :size="12"
                    />
                  </button>
                  <span v-else class="tree-row__caret-space" aria-hidden="true"></span>
                  <UiIcon class="tree-row__icon" :path="rowIcon(row.node)" :size="14" />
                  <span class="tree-row__label">{{ labelOfNode(row.node) }}</span>
                  <span v-if="nodeMetaText(row.node)" class="tree-row__name">
                    {{ nodeMetaText(row.node) }}
                  </span>
                  <span v-if="row.node.locked" class="tree-row__lock">
                    <UiIcon :path="mdiLockOutline" :size="12" />锁定
                  </span>
                  <span
                    v-else-if="isSlotNode(row.node)"
                    class="tree-row__lock tree-row__lock--slot"
                    title="文章正文插槽：可移动、可套容器，不能删除"
                  >
                    <UiIcon :path="icons.shield" :size="12" />受保护
                  </span>
                </div>
                <div
                  v-if="row.node.id === insertAnchorId && insertTarget"
                  class="insert-line"
                  aria-hidden="true"
                >
                  <span class="insert-line__bar"></span>
                  <span class="insert-line__label">插入到这里</span>
                </div>
              </template>
            </div>
          </div>
        </aside>

        <div class="board">
          <HtmlBlocks
            v-if="htmlPostMode"
            root
            :nodes="outline"
            :selected-id="selectedId"
            :catalog="htmlCatalog"
            @select="onHtmlSelect"
            @text="onHtmlText"
            @insert="onHtmlInsert"
            @move="onHtmlMove"
            @remove="onHtmlRemove"
            @duplicate="onHtmlDuplicate"
            @replace="onHtmlReplace"
          />
          <div v-else-if="!stageLive" class="board-empty">
            <UiEmpty
              v-if="session.building"
              title="正在打开页面"
              description="站点跑起来之后，真页面会出现在这块舞台上。"
              :icon="icons.preview"
            />
            <UiEmpty
              v-else
              title="舞台还没有页面"
              description="打开页面后，点上面的元素就能选中，右侧改属性。"
              :icon="icons.preview"
            >
              <template #action>
                <UiButton
                  variant="primary"
                  size="sm"
                  :loading="session.building"
                  @click="ensurePreview"
                >
                  打开页面
                </UiButton>
              </template>
            </UiEmpty>
          </div>
          <div v-if="!htmlPostMode" ref="boardEl" class="board-hole" />
        </div>
      </div>

      <footer v-show="!sourceMode" class="stage-foot">
        <span>{{ totalNodes }} 个节点</span>
        <span v-if="selectedRow" class="stage-foot__sep">·</span>
        <span v-if="selectedRow" class="stage-foot__path">{{ selectedPath }}</span>
        <div class="grow"></div>
        <UiIcon :path="icons.preview" :size="13" />
        <span>{{
          htmlPostMode
            ? '点块即可改字；拖左侧手柄换位置，靠近中线会吸进容器'
            : dropLabel || '拖组件到页面上；Ctrl+滚轮缩放，空格拖动画布'
        }}</span>
      </footer>
    </section>
    <div
      v-if="dragGhost"
      class="drag-ghost"
      :style="{ left: `${dragGhost.x + 12}px`, top: `${dragGhost.y + 12}px` }"
    >
      {{ dragGhost.label }}
    </div>
    </div>
  </div>

  <Teleport v-if="hostReady" to="#inspector-host">
    <div class="inspector">
      <div v-if="htmlPostMode" class="wp-tabs" role="tablist">
        <button type="button" :class="{ on: htmlSide === 'block' }" @click="htmlSide = 'block'">区块</button>
        <button type="button" :class="{ on: htmlSide === 'doc' }" @click="htmlSide = 'doc'">文档</button>
      </div>
      <header class="inspector-head">
        <span class="inspector-head__icon">
          <UiIcon :path="selectedIcon" :size="15" />
        </span>
        <div class="inspector-head__title">
          <span>{{ selectedId ? selectedTitle : htmlPostMode ? '整页' : '页面' }}</span>
          <UiBadge v-if="selectedId" tone="neutral" size="sm">{{ selectedKindLabel }}</UiBadge>
        </div>
        <UiButton
          v-if="selectedId"
          variant="ghost"
          size="sm"
          :icon="icons.close"
          aria-label="取消选择"
          @click="clearSelection"
        />
        <span v-else class="inspector-head__hint">{{ error ? '读取失败' : '未选中对象' }}</span>
      </header>

      <div class="inspector-body">
        <UiEmpty
          v-if="!session.siteDir"
          title="先打开一个站点"
          description="页面搭建需要一个已打开的 Astro 站点。"
          :icon="icons.repo"
        />

        <UiEmpty
          v-else-if="htmlInspector === 'empty'"
          title="未选择区块"
          description="在编辑区点一个区块，或输入 / 插入。"
          :icon="icons.pages"
        />

        <template v-else-if="htmlInspector === 'block' && selectedRow">
          <!-- 文字节点 / 单一文字子节点 -->
          <UiPanel v-if="selectedTextNode && !htmlPostMode" title="文字" collapsible>
            <UiField label="文字内容" hint="改完点出输入框即写入源码">
              <UiTextarea v-model="textDraft" :rows="4" @change="commitText" />
            </UiField>
          </UiPanel>
          <p v-else-if="htmlPostMode && selectedTextNode" class="inspector-tip">
            文字直接在页面上改，点到别处就写入。
          </p>

          <!-- 模板锁定 -->
          <UiPanel v-if="selectedRow.node.kind === 'locked'" title="模板代码">
            <p class="hint-text">
              这块是模板代码（脚本、样式或表达式），为了不弄坏页面，搭建里不能直接改。
            </p>
            <div class="inspector-actions">
              <UiButton size="sm" :icon="icons.code" @click="openSource">切到源码</UiButton>
            </div>
          </UiPanel>

          <!-- 正文插槽：文章内容渲染的位置，受保护 -->
          <UiPanel v-else-if="isSlotNode(selectedRow.node)" title="正文">
            <p class="hint-text">
              这里是文章正文的位置（<code>&lt;slot /&gt;</code>）。可以拖动它、或把它套进区块/分栏；
              不能删除，也不接受组件属性。
            </p>
            <p class="inspector-tip">
              想把正文放进分栏：先在页面上插入「分栏组」，再把正文拖进分栏。
            </p>
            <div class="inspector-actions">
              <UiButton size="sm" :icon-left="icons.code" @click="openSource">切到源码</UiButton>
              <UiButton size="sm" :icon-left="icons.posts" @click="backToWriting"
                >回到写作</UiButton
              >
            </div>
          </UiPanel>

          <!-- 组件属性 -->
          <template v-else-if="selectedRow.node.kind !== 'text'">
            <div v-if="propsLoading" class="loading-line">
              <UiSpinner :size="14" />
              <span>正在读取属性…</span>
            </div>
            <UiEmpty
              v-else-if="groupedProps.length === 0"
              title="这个组件没有可编辑属性"
              description="在页面上点旁边的加号放入子组件，或切到源码定制。"
              :icon="icons.settings"
            />
            <UiPanel
              v-for="group in inspectorGroups"
              :key="group.key"
              :title="group.label"
              collapsible
              :default-open="group.key !== 'advanced'"
            >
              <div class="prop-list">
                <template v-for="spec in group.specs" :key="spec.name">
                  <div v-if="spec.type === 'boolean'" class="prop-switch">
                    <span class="prop-switch__label">{{ specLabel(spec) }}</span>
                    <UiSwitch
                      :model-value="Boolean(draft[spec.name])"
                      :aria-label="specLabel(spec)"
                      @update:model-value="commitProp(spec, $event)"
                    />
                  </div>

                  <UiField
                    v-else-if="spec.type === 'list'"
                    :label="specLabel(spec)"
                    hint="列表属性请在源码里改"
                  >
                    <div class="prop-readonly">{{ displayValue(spec) }}</div>
                  </UiField>

                  <UiField
                    v-else
                    :label="specLabel(spec)"
                    :hint="spec.type === 'number' ? propRange(spec) : undefined"
                  >
                    <template v-if="canReset(spec)" #action>
                      <UiButton
                        variant="ghost"
                        size="sm"
                        aria-label="恢复默认值"
                        @click="resetProp(spec)"
                      >
                        默认
                      </UiButton>
                    </template>

                    <UiSelect
                      v-if="spec.type === 'enum'"
                      :model-value="String(draft[spec.name] ?? '')"
                      :options="optionItems(spec)"
                      placeholder="未设置"
                      size="sm"
                      @update:model-value="commitProp(spec, String($event))"
                    />
                    <UiSlider
                      v-else-if="spec.type === 'number'"
                      :model-value="Number(draft[spec.name] ?? 0)"
                      :min="spec.min ?? 0"
                      :max="spec.max ?? 100"
                      :step="1"
                      :unit="spec.unit ?? ''"
                      @update:model-value="setDraft(spec, Number($event))"
                      @change="commitProp(spec, Number(draft[spec.name] ?? 0))"
                    />
                    <UiInput
                      v-else
                      :model-value="String(draft[spec.name] ?? '')"
                      :placeholder="spec.placeholder ?? '未设置'"
                      size="sm"
                      @update:model-value="setDraft(spec, $event)"
                      @change="commitProp(spec, String(draft[spec.name] ?? ''))"
                      @keydown.enter="commitProp(spec, String(draft[spec.name] ?? ''))"
                    />
                  </UiField>
                </template>
              </div>
            </UiPanel>

            <p v-if="groupedProps.length" class="inspector-tip">
              {{ historyHint() }}
            </p>
          </template>
        </template>

        <!-- 未选中：页面级操作 -->
        <template v-else>
          <UiPanel :title="htmlPostMode ? '整页' : '页面'">
            <div class="page-info">
              <div class="page-info__row">
                <span class="page-info__key">文件</span>
                <code class="page-file">{{ session.activePage }}</code>
              </div>
              <div class="page-info__row">
                <span class="page-info__key">路由</span>
                <span>{{ pageRoute || '—' }}</span>
              </div>
              <div v-if="!htmlPostMode" class="page-info__row">
                <span class="page-info__key">结构</span>
                <span>{{ totalNodes }} 个节点</span>
              </div>
              <div v-if="layoutMode" class="page-info__row">
                <span class="page-info__key">文章</span>
                <span>{{ layoutTitle || layoutSlug }}</span>
              </div>
            </div>
            <p v-if="layoutMode" class="hint-text">
              这是《{{
                layoutTitle || layoutSlug
              }}》的专属版式：改动只影响这篇文章，其他文章继续用默认版式。
            </p>
            <p v-else-if="isSystemPage(session.activePage)" class="hint-text">
              这是共用容器，不是某一篇文章。改动会作用到多篇文章或整个站点。
            </p>
            <div class="inspector-actions">
              <UiButton size="sm" :icon-left="icons.refresh" :loading="loading" @click="reload()">
                刷新结构
              </UiButton>
              <UiButton size="sm" :icon-left="icons.code" @click="openSource">切到源码</UiButton>
              <UiButton v-if="layoutMode" size="sm" :icon-left="icons.back" @click="backToWriting">
                回到写作
              </UiButton>
            </div>
          </UiPanel>

          <UiPanel v-if="!layoutMode && pageStyleSupported" :title="htmlPostMode ? '整页样式' : '页面样式'" collapsible>
            <div v-if="!pageStyleSupported" class="hint-text">
              {{ pageStyleUnsupportedReason }}
            </div>
            <div v-else class="prop-list">
              <p class="style-file">
                <UiIcon :path="icons.files" :size="12" />
                <span class="style-file__path">src/styles/pages/{{ pageStyleSlug }}.css</span>
                <UiBadge v-if="pageStyleExists" tone="accent" size="sm">已有</UiBadge>
              </p>

              <div v-if="pageStyleLoading" class="loading-line">
                <UiSpinner :size="14" />
                <span>正在读取页面样式…</span>
              </div>

              <template v-else>
                <UiField label="内容宽度" hint="覆盖站点默认的正文列宽">
                  <UiSelect v-model="pageStyle.width" :options="PAGE_WIDTH_OPTIONS" size="sm" />
                </UiField>
                <UiField label="页面留白" hint="页面主体上下留白">
                  <UiSelect v-model="pageStyle.padding" :options="PAGE_PADDING_OPTIONS" size="sm" />
                </UiField>
                <UiField label="页面背景">
                  <UiSelect
                    v-model="pageStyle.background"
                    :options="PAGE_BACKGROUND_OPTIONS"
                    size="sm"
                  />
                </UiField>
                <div class="prop-switch">
                  <span class="prop-switch__label">隐藏左侧栏</span>
                  <UiSwitch v-model="pageStyle.hideSide" aria-label="隐藏左侧栏" />
                </div>
                <div class="prop-switch">
                  <span class="prop-switch__label">隐藏目录</span>
                  <UiSwitch v-model="pageStyle.hideToc" aria-label="隐藏目录" />
                </div>

                <div v-if="!pageStyleKnown" class="style-unknown">
                  <p class="hint-text">
                    这个页面已有手写样式，面板里认不出的规则会被覆盖。先看下面只读内容，确认后再整份替换。
                  </p>
                  <UiTextarea
                    :model-value="pageStyleExisting"
                    :rows="6"
                    readonly
                    aria-label="现有页面样式"
                  />
                  <UiButton
                    variant="danger"
                    size="sm"
                    :loading="pageStyleSaving"
                    @click="overwriteStyleOpen = true"
                  >
                    覆盖写入
                  </UiButton>
                </div>

                <div class="inspector-actions">
                  <UiButton
                    v-if="pageStyleKnown"
                    variant="primary"
                    size="sm"
                    :loading="pageStyleSaving"
                    @click="savePageStyle"
                  >
                    写入样式
                  </UiButton>
                  <UiButton
                    size="sm"
                    :disabled="!pageStyleExists || pageStyleSaving"
                    @click="resetStyleOpen = true"
                  >
                    恢复默认
                  </UiButton>
                </div>
                <p class="inspector-tip">
                  写进 src/styles/pages/ 下的 CSS，不改页面源码；重新构建后生效。
                </p>
              </template>
            </div>
          </UiPanel>

          <UiPanel v-if="!layoutMode && !htmlPostMode" title="新建页面" collapsible>
            <div class="prop-list">
              <UiField label="页面地址" hint="小写字母、数字和连字符，例如 about">
                <UiInput
                  v-model="newSlug"
                  size="sm"
                  placeholder="about"
                  @keydown.enter="createPage"
                />
              </UiField>
              <UiField label="模板">
                <UiSegmented v-model="newTemplate" :items="templateItems" />
              </UiField>
              <UiButton
                variant="primary"
                size="sm"
                :icon="icons.plus"
                :loading="creating"
                :disabled="!newSlug.trim()"
                @click="createPage"
              >
                新建页面
              </UiButton>
            </div>
          </UiPanel>

          <UiPanel title="提示" collapsible :default-open="false">
            <p v-if="htmlPostMode" class="hint-text">
              文字直接在页面上改。点一块改样式；没选中时，这里设定整页。套用模板会放进文章版式。独立成页没有文章模板，也没有站点顶栏和页脚；正文若已是完整 HTML 文档，就原样输出。
            </p>
            <p v-else class="hint-text">
              中间是真页面。点页面上的块选中它，右侧改属性。左边是结构，不是图层；图层只指样式里的前后关系。
            </p>
          </UiPanel>
        </template>
      </div>

      <footer v-if="selectedId && !htmlPostMode" class="inspector-foot">{{ selectedPath }}</footer>
    </div>
  </Teleport>

  <UiDialog v-model="overwriteStyleOpen" title="覆盖现有页面样式？" :width="560">
    <div class="dialog-stack">
      <p class="hint-text">
        下面这些既有规则含面板认不出的写法，覆盖后会丢失，只保留面板里设置的内容。
      </p>
      <UiTextarea :model-value="pageStyleExisting" :rows="8" readonly aria-label="现有页面样式" />
    </div>
    <template #actions>
      <UiButton size="sm" @click="overwriteStyleOpen = false">取消</UiButton>
      <UiButton
        variant="danger"
        size="sm"
        :loading="pageStyleSaving"
        @click="confirmOverwriteStyle"
      >
        覆盖写入
      </UiButton>
    </template>
  </UiDialog>

  <UiDialog v-model="resetStyleOpen" title="恢复默认页面样式？" :width="460">
    <p class="hint-text">
      会删除 src/styles/pages/{{ pageStyleSlug }}.css，这个页面回到站点默认样式；重新构建后生效。
    </p>
    <template #actions>
      <UiButton size="sm" @click="resetStyleOpen = false">取消</UiButton>
      <UiButton variant="danger" size="sm" :loading="pageStyleSaving" @click="confirmResetStyle">
        恢复默认
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.canvas-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.bar-label {
  display: inline;
}

@media (max-width: 1180px) {
  .bar-label {
    display: none;
  }
}

.canvas-body {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.canvas-view.is-source .canvas-body,
.canvas-view.is-html .canvas-body {
  grid-template-columns: minmax(0, 1fr);
}

.canvas-view.is-html .stage-body {
  grid-template-columns: minmax(0, 1fr);
}

.canvas-view.is-html .board {
  overflow: hidden;
}

.page-source {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.grow {
  flex: 1;
}

/* ---------------------------------- 组件面板 ---------------------------------- */

.palette {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ui-line);
  background: var(--ui-panel);
}

.palette-head {
  padding: var(--ui-s2);
  border-bottom: 1px solid var(--ui-line);
}

.palette-scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ui-s4);
  min-height: 0;
  padding: var(--ui-s2);
  overflow: auto;
}

.palette-group {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  min-width: 0;
}

.palette-group__title {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  margin: 0;
  padding: 0 var(--ui-s1);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.palette-group__count {
  margin-left: auto;
  color: var(--ui-text-3);
  font-weight: 400;
}

.palette-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
}

.palette-item {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
  padding: var(--ui-s1) var(--ui-s2);
  border: 1px solid transparent;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  text-align: left;
  cursor: grab;
  transition:
    background-color var(--ui-dur) var(--ui-ease),
    border-color var(--ui-dur) var(--ui-ease);
}

.palette-item:hover:not(:disabled) {
  border-color: var(--ui-line);
  background: var(--ui-hover);
}

.palette-item:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.palette-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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

.palette-item:hover:not(:disabled) .palette-item__icon {
  color: var(--ui-accent);
}

.palette-item__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.palette-item__label {
  overflow: hidden;
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item__hint {
  overflow: hidden;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item__spinner {
  flex: none;
  color: var(--ui-accent);
}

.palette-foot {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  padding: var(--ui-s2) var(--ui-s3);
  border-top: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

/* ----------------------------------- 画布 ----------------------------------- */

.stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.stage-bar {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: 40px;
  padding: 0 var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.stage-bar__left,
.stage-bar__right {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-width: 0;
}

.stage-bar__right {
  margin-left: auto;
}

.zoom-read {
  min-width: 3em;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  text-align: right;
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
  box-shadow: 0 4px 12px rgb(0 0 0 / 35%);
}

.stage-bar__page-icon {
  color: var(--ui-text-3);
}

.page-select {
  width: 220px;
  flex: none;
}

.stage-route {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-title {
  min-width: 0;
  max-width: 280px;
  overflow: hidden;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-body {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.stage-body.layers-collapsed {
  grid-template-columns: 36px minmax(0, 1fr);
}

.layers {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--ui-line);
  background: var(--ui-panel);
}

.layers-head {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  min-height: 36px;
  padding: 0 var(--ui-s2);
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  font-weight: 600;
}

.layers-head > span {
  flex: 1;
  min-width: 0;
}

.layers-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.board {
  position: relative;
  min-width: 0;
  min-height: 0;
  background: #07090e;
}

.board-hole {
  position: absolute;
  inset: 12px;
}

.board-empty {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  background: var(--ui-bg);
}

.stage-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-s2);
  height: 100%;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.stage-state p {
  margin: 0;
}

.outline-tree {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  min-height: 0;
  padding: var(--ui-s2);
}

.tree-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: var(--ui-h-sm);
  padding-right: var(--ui-s3);
  border-radius: var(--ui-r-sm);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--ui-dur) var(--ui-ease);
}

.tree-row:hover {
  background: var(--ui-hover);
}

.tree-row:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.tree-row.is-selected {
  background: var(--ui-active);
  color: var(--ui-text);
}

.tree-row.is-selected::before {
  position: absolute;
  top: var(--ui-s1);
  bottom: var(--ui-s1);
  left: 0;
  width: 2px;
  border-radius: 1px;
  background: var(--ui-accent);
  content: '';
}

.tree-row.is-locked {
  color: var(--ui-text-3);
  cursor: default;
  opacity: 0.6;
}

/* 正文插槽：不是锁定节点（可移动/可套容器），但视觉上要区别于普通组件。 */
.tree-row.is-slot {
  color: var(--ui-text);
}

.tree-row.is-slot .tree-row__icon {
  color: var(--ui-accent);
}

.tree-row__caret {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ui-s5);
  height: var(--ui-s5);
  padding: 0;
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-3);
  cursor: pointer;
}

.tree-row__caret:hover {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.tree-row__caret-space {
  flex: none;
  width: var(--ui-s5);
}

.tree-row__icon {
  flex: none;
  color: var(--ui-text-3);
}

.tree-row.is-selected .tree-row__icon {
  color: var(--ui-accent);
}

.tree-row__label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-row__name {
  flex: none;
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.tree-row__lock {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s1);
  margin-left: auto;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.tree-row__lock--slot {
  color: var(--ui-accent);
}

.insert-line {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  height: 20px;
  padding-left: var(--ui-s3);
}

.insert-line__bar {
  flex: 1;
  height: 0;
  border-top: 1px dashed var(--ui-accent);
}

.insert-line__label {
  flex: none;
  color: var(--ui-accent);
  font-size: var(--ui-fs-1);
  line-height: 1;
}

.stage-foot {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: 28px;
  padding: 0 var(--ui-s3);
  border-top: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.stage-foot__sep {
  color: var(--ui-line-2);
}

.stage-foot__path {
  min-width: 0;
  max-width: 50%;
  overflow: hidden;
  color: var(--ui-text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------------------------- 检查器 ---------------------------------- */

.inspector {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.wp-tabs {
  display: flex;
  flex: none;
  border-bottom: 1px solid var(--ui-line);
}

.wp-tabs button {
  flex: 1;
  height: 40px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ui-text-2);
  cursor: pointer;
}

.wp-tabs button.on {
  color: var(--ui-text);
  border-bottom-color: var(--ui-accent);
}

.inspector-head {
  position: sticky;
  top: 0;
  z-index: var(--ui-z-sticky);
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: 40px;
  padding: var(--ui-s1) var(--ui-s2) var(--ui-s1) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  background: var(--ui-panel);
}

.inspector-head__icon {
  display: inline-flex;
  flex: none;
  color: var(--ui-text-3);
}

.inspector-head__title {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-width: 0;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.inspector-head__title > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-head__hint {
  margin-left: auto;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.inspector-head > :last-child:not(.inspector-head__title) {
  margin-left: auto;
}

.inspector-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ui-s3);
  padding: var(--ui-s3);
}

.inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s2);
  margin-top: var(--ui-s3);
}

.inspector-foot {
  padding: var(--ui-s2) var(--ui-s3);
  border-top: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  overflow-wrap: anywhere;
}

.prop-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.prop-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  min-height: var(--ui-h-sm);
}

.prop-switch__label {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.prop-readonly {
  padding: var(--ui-s1) var(--ui-s2);
  border: 1px dashed var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  overflow-wrap: anywhere;
}

.loading-line {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s2) 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.page-info {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}

.page-info__row {
  display: flex;
  align-items: baseline;
  gap: var(--ui-s2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.page-info__key {
  flex: none;
  color: var(--ui-text-3);
}

.page-file {
  min-width: 0;
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  overflow-wrap: anywhere;
}

.hint-text {
  margin: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.inspector-tip {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.style-file {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.style-file__path {
  min-width: 0;
  overflow: hidden;
  font-family: var(--ui-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.style-unknown {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  padding: var(--ui-s3);
  border: 1px dashed var(--ui-warn);
  border-radius: var(--ui-r-sm);
  background: var(--ui-warn-weak);
}

.dialog-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}
</style>
