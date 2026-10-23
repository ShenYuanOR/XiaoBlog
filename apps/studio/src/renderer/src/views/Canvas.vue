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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
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

// 写操作串行化，避免连续改属性时两次 reload 互相覆盖。
let writeQueue: Promise<unknown> = Promise.resolve();
let propsToken = 0;
let reloadToken = 0;
let nestToken = 0;
let stopPick: () => void = () => undefined;

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
  return node ? kindLabel(node) : '';
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
  return META_BY_NAME.get(node.name)?.label ?? node.name;
}

function nodeMetaText(node: OutlineNode): string {
  if (node.kind === 'text' || node.kind === 'locked') return '';
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
  const meta = META_BY_NAME.get(node.name);
  if (meta) return CATEGORY_ICON[meta.category];
  if (isLayoutName(node.name)) return icons.pages;
  if (node.kind === 'component') return mdiWidgetsOutline;
  return mdiCodeTags;
}

function pageLabel(file: string): string {
  const base = file.replace(/^src\/pages\//, '').replace(/\.astro$/, '');
  if (base === 'index') return '首页';
  return base.endsWith('/index') ? base.slice(0, -6) : base;
}

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
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    icon: CATEGORY_ICON[category],
    items: COMPONENTS.filter(
      (meta) =>
        meta.category === category &&
        (needle === '' ||
          meta.label.toLowerCase().includes(needle) ||
          meta.name.toLowerCase().includes(needle)),
    ),
  })).filter((group) => group.items.length > 0);
});

const pageOptions = computed(() => {
  const list = [...pages.value];
  if (session.activePage && !list.includes(session.activePage)) list.unshift(session.activePage);
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
  const [outlineResult, hrefResult] = await Promise.all([
    window.xiao.canvas.outline(session.siteDir, page),
    window.xiao.page.href(session.siteDir, page),
  ]);
  if (token !== reloadToken) return;
  loading.value = false;
  pageRoute.value = hrefResult.ok && hrefResult.data ? `/${hrefResult.data}` : '';
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
  const textNode = node.kind === 'text' ? node : singleTextNode(node);
  textDraft.value = textNode?.text ?? '';
  if (node.kind === 'text') {
    propSpecs.value = [];
    draft.value = {};
    propsLoading.value = false;
    return;
  }
  await loadPropSpecs(node);
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

async function insertComponent(meta: ComponentMeta): Promise<void> {
  const target = insertTarget.value;
  if (!target || busy.value || insertPending.value || !session.siteDir) return;
  const reason = blocked.value[meta.name];
  if (reason) {
    notify(`${reason}；换一个容器再试。`, 'error', 'canvas-insert-blocked');
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
  if (!session.siteDir || !session.activePage) return;
  session.devOpen = session.activePage;
  session.setMode('develop');
  notify(`已在开发者模式打开 ${session.activePage}`, 'info', 'canvas-source');
}

function switchPage(value: string | number): void {
  const file = String(value);
  if (!file || file === session.activePage) return;
  session.setPage(file);
}

// ---------------------------------------------------------------------------
// 预览联动
// ---------------------------------------------------------------------------

async function focusPreview(id: string): Promise<void> {
  if (!session.previewUrl) return;
  try {
    await window.xiao.preview.focus(session.activePage, id);
  } catch {
    // 只有独立预览窗会接收定位事件，停靠预览下失败可以忽略。
  }
}

async function onPreviewPick(payload: { file: string; offset: string }): Promise<void> {
  const file = payload.file.replaceAll('\\', '/');
  const current = session.activePage.replaceAll('\\', '/');
  if (file !== current) {
    notify(
      `选中的元素来自 ${file}，当前只编辑页面文件 ${current}；页面文件里的元素才能在这里选中。`,
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
  await selectNode(row.node, false);
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
  void reload(selectedId.value);
}

function onSaveRequest(): void {
  if (!session.siteDir) return;
  void reload(selectedId.value);
}

watch(
  () => session.activePage,
  () => {
    expanded.value = [];
    clearSelection();
    void reload('');
  },
);

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

onMounted(() => {
  checkInspectorHost();
  window.addEventListener('xiao-canvas', onCanvasRefresh);
  window.addEventListener('xiao:save', onSaveRequest);
  stopPick = window.xiao.preview.onPick((payload) => {
    void onPreviewPick(payload);
  });
  void loadPages();
  void reload();
  void loadPageStyle();
});

onBeforeUnmount(() => {
  window.removeEventListener('xiao-canvas', onCanvasRefresh);
  window.removeEventListener('xiao:save', onSaveRequest);
  stopPick();
});
</script>

<template>
  <div class="canvas-view">
    <aside class="palette" aria-label="组件面板">
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
              :disabled="
                !insertTarget || busy || Boolean(blocked[meta.name]) || Boolean(insertPending)
              "
              :title="
                blocked[meta.name] ??
                (insertTarget ? `放入${insertTarget.label}` : '先选中一个可插入的容器')
              "
              @click="insertComponent(meta)"
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
      <header class="stage-bar">
        <div class="stage-bar__left">
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
          <UiBadge v-if="pageRoute" class="stage-route" tone="neutral" size="sm">
            {{ pageRoute }}
          </UiBadge>
        </div>
        <div class="stage-bar__right">
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
        </div>
      </header>

      <div class="stage-body">
        <div v-if="loading && !outline.length" class="stage-state">
          <UiSpinner :size="20" />
          <p>正在读取页面结构…</p>
        </div>

        <UiEmpty v-else-if="error" title="读不到页面结构" :description="error" :icon="icons.alert">
          <template #action>
            <UiButton size="sm" @click="reload()">刷新重试</UiButton>
            <UiButton size="sm" variant="ghost" :icon="icons.code" @click="openSource">
              打开源码
            </UiButton>
          </template>
        </UiEmpty>

        <UiEmpty
          v-else-if="!outline.length"
          title="这页还是空的"
          description="页面里还没有可识别的结构。去源码里加一个根布局（例如 PageLayout），或者插入后点刷新。"
          :icon="icons.pages"
        >
          <template #action>
            <UiButton size="sm" @click="reload()">刷新结构</UiButton>
            <UiButton size="sm" variant="ghost" :icon="icons.code" @click="openSource">
              在源码里自定义
            </UiButton>
          </template>
        </UiEmpty>

        <div v-else class="outline-tree" role="tree" aria-label="页面结构">
          <template v-for="(row, index) in visibleRows" :key="row.node.id">
            <div
              :id="rowDomId(row.node.id)"
              class="tree-row"
              :class="{
                'is-selected': row.node.id === selectedId,
                'is-locked': row.node.locked,
                'is-container': row.container,
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

      <footer class="stage-foot">
        <span>{{ totalNodes }} 个节点</span>
        <span v-if="selectedRow" class="stage-foot__sep">·</span>
        <span v-if="selectedRow" class="stage-foot__path">{{ selectedPath }}</span>
        <div class="grow"></div>
        <UiIcon :path="icons.preview" :size="13" />
        <span>预览里点元素可选中；滚动定位需独立预览窗</span>
      </footer>
    </section>
  </div>

  <Teleport v-if="hostReady" to="#inspector-host">
    <div class="inspector">
      <header class="inspector-head">
        <span class="inspector-head__icon">
          <UiIcon :path="selectedIcon" :size="15" />
        </span>
        <div class="inspector-head__title">
          <span>{{ selectedId ? selectedTitle : '页面' }}</span>
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

        <template v-else-if="selectedId && selectedRow">
          <!-- 文字节点 / 单一文字子节点 -->
          <UiPanel v-if="selectedTextNode" title="文字" collapsible>
            <UiField label="文字内容" hint="改完点出输入框即写入源码">
              <UiTextarea v-model="textDraft" :rows="4" @change="commitText" />
            </UiField>
          </UiPanel>

          <!-- 模板锁定 -->
          <UiPanel v-if="selectedRow.node.kind === 'locked'" title="模板代码">
            <p class="hint-text">
              这块是模板代码（脚本、样式或表达式），为了不弄坏页面，搭建里不能直接改。
            </p>
            <div class="inspector-actions">
              <UiButton size="sm" :icon="icons.code" @click="openSource">去源码里改</UiButton>
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
              description="可以在结构树里继续放子组件，或去源码里定制。"
              :icon="icons.settings"
            />
            <UiPanel
              v-for="group in groupedProps"
              :key="group.key"
              :title="group.label"
              collapsible
              :default-open="group.key !== 'advanced'"
            >
              <div class="prop-list">
                <template v-for="spec in group.specs" :key="spec.name">
                  <div v-if="spec.type === 'boolean'" class="prop-switch">
                    <span class="prop-switch__label">{{ spec.label }}</span>
                    <UiSwitch
                      :model-value="Boolean(draft[spec.name])"
                      :aria-label="spec.label"
                      @update:model-value="commitProp(spec, $event)"
                    />
                  </div>

                  <UiField
                    v-else-if="spec.type === 'list'"
                    :label="spec.label"
                    hint="列表属性请在源码里改"
                  >
                    <div class="prop-readonly">{{ displayValue(spec) }}</div>
                  </UiField>

                  <UiField
                    v-else
                    :label="spec.label"
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
          <UiPanel title="页面">
            <div class="page-info">
              <div class="page-info__row">
                <span class="page-info__key">文件</span>
                <code class="page-file">{{ session.activePage }}</code>
              </div>
              <div class="page-info__row">
                <span class="page-info__key">路由</span>
                <span>{{ pageRoute || '—' }}</span>
              </div>
              <div class="page-info__row">
                <span class="page-info__key">结构</span>
                <span>{{ totalNodes }} 个节点</span>
              </div>
            </div>
            <div class="inspector-actions">
              <UiButton size="sm" :icon="icons.refresh" :loading="loading" @click="reload()">
                刷新结构
              </UiButton>
              <UiButton size="sm" :icon="icons.code" @click="openSource">源码里自定义</UiButton>
            </div>
          </UiPanel>

          <UiPanel title="页面样式" collapsible>
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

          <UiPanel title="新建页面" collapsible>
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
            <p class="hint-text">
              点结构里的节点选中它，右侧会变成属性表单；点组件面板里的组件会插到选中容器末尾。启动预览后，点预览里的元素也能反向选中结构。
            </p>
          </UiPanel>
        </template>
      </div>

      <footer v-if="selectedId" class="inspector-foot">{{ selectedPath }}</footer>
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
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  background: var(--ui-bg);
  color: var(--ui-text);
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
  cursor: pointer;
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

.stage-body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
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
  min-height: 100%;
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
