import {
  mdiCardOutline,
  mdiCodeTags,
  mdiFormatListBulleted,
  mdiImageOutline,
  mdiPackageVariantClosed,
  mdiViewDashboardOutline,
} from '@mdi/js';

export type AstroBlockCategory = 'structure' | 'container' | 'content' | 'blog' | 'embed';

export interface AstroBlock {
  name: string;
  label: string;
  category: AstroBlockCategory;
  snippet: string;
}

export const ASTRO_CATEGORY_ORDER: AstroBlockCategory[] = [
  'structure',
  'container',
  'content',
  'blog',
  'embed',
];

export const ASTRO_CATEGORY_LABEL: Record<AstroBlockCategory, string> = {
  structure: '结构',
  container: '容器',
  content: '组件内容',
  blog: '博客',
  embed: '嵌入',
};

const CATEGORY_ICON: Record<AstroBlockCategory, string> = {
  structure: mdiViewDashboardOutline,
  container: mdiPackageVariantClosed,
  content: mdiFormatListBulleted,
  blog: mdiCardOutline,
  embed: mdiImageOutline,
};

/** 与 packages/core 组件清单对齐的插入片段；渲染进程不直接 import 带 fs 的 manifest。 */
export const ASTRO_BLOCKS: AstroBlock[] = [
  {
    name: 'Section',
    label: '区块',
    category: 'structure',
    snippet: '<Section>\n  <Text>正文</Text>\n</Section>',
  },
  {
    name: 'Container',
    label: '容器',
    category: 'structure',
    snippet: '<Container>\n  <Text>正文</Text>\n</Container>',
  },
  {
    name: 'Stack',
    label: '堆叠',
    category: 'structure',
    snippet: '<Stack>\n  <Text>第一项</Text>\n  <Text>第二项</Text>\n</Stack>',
  },
  {
    name: 'Grid',
    label: '网格',
    category: 'structure',
    snippet:
      '<Grid>\n  <Card>\n    <Text>卡片一</Text>\n  </Card>\n  <Card>\n    <Text>卡片二</Text>\n  </Card>\n</Grid>',
  },
  {
    name: 'Columns',
    label: '分栏组',
    category: 'structure',
    snippet:
      '<Columns>\n  <Column>\n    <Text>第一栏</Text>\n  </Column>\n  <Column>\n    <Text>第二栏</Text>\n  </Column>\n</Columns>',
  },
  {
    name: 'Column',
    label: '分栏',
    category: 'structure',
    snippet: '<Column>\n  <Text>分栏内容</Text>\n</Column>',
  },
  {
    name: 'Card',
    label: '卡片',
    category: 'container',
    snippet: '<Card>\n  <Text>卡片内容</Text>\n</Card>',
  },
  {
    name: 'Callout',
    label: '提示框',
    category: 'container',
    snippet: '<Callout>\n  <Text>提示内容</Text>\n</Callout>',
  },
  {
    name: 'Accordion',
    label: '折叠面板',
    category: 'container',
    snippet: '<Accordion>\n  <Text>折叠内容</Text>\n</Accordion>',
  },
  {
    name: 'Tabs',
    label: '标签页',
    category: 'container',
    snippet:
      '<Tabs>\n  <TabPanel>\n    <Text>面板一</Text>\n  </TabPanel>\n  <TabPanel>\n    <Text>面板二</Text>\n  </TabPanel>\n</Tabs>',
  },
  {
    name: 'TabPanel',
    label: '标签面板',
    category: 'container',
    snippet: '<TabPanel>\n  <Text>面板内容</Text>\n</TabPanel>',
  },
  { name: 'Text', label: '文本', category: 'content', snippet: '<Text>正文</Text>' },
  { name: 'Heading', label: '标题', category: 'content', snippet: '<Heading>标题</Heading>' },
  {
    name: 'RichText',
    label: '富文本',
    category: 'content',
    snippet: '<RichText>正文内容</RichText>',
  },
  { name: 'Quote', label: '引用', category: 'content', snippet: '<Quote>引用内容</Quote>' },
  { name: 'Code', label: '代码块', category: 'content', snippet: '<Code></Code>' },
  { name: 'Badge', label: '徽章', category: 'content', snippet: '<Badge>新</Badge>' },
  { name: 'Button', label: '按钮', category: 'content', snippet: '<Button>按钮</Button>' },
  { name: 'Link', label: '链接', category: 'content', snippet: '<Link>链接文字</Link>' },
  { name: 'Icon', label: '图标', category: 'content', snippet: '<Icon></Icon>' },
  { name: 'Divider', label: '分隔线', category: 'content', snippet: '<Divider></Divider>' },
  { name: 'Spacer', label: '留白', category: 'content', snippet: '<Spacer></Spacer>' },
  { name: 'PostList', label: '文章列表', category: 'blog', snippet: '<PostList></PostList>' },
  { name: 'PostCard', label: '文章卡片', category: 'blog', snippet: '<PostCard></PostCard>' },
  {
    name: 'CategoryTree',
    label: '分类树',
    category: 'blog',
    snippet: '<CategoryTree></CategoryTree>',
  },
  { name: 'TagCloud', label: '标签云', category: 'blog', snippet: '<TagCloud></TagCloud>' },
  { name: 'Pagination', label: '翻页', category: 'blog', snippet: '<Pagination></Pagination>' },
  { name: 'Profile', label: '作者信息', category: 'blog', snippet: '<Profile></Profile>' },
  { name: 'Toc', label: '目录', category: 'blog', snippet: '<Toc></Toc>' },
  { name: 'Image', label: '图片', category: 'embed', snippet: '<Image></Image>' },
  { name: 'Gallery', label: '图库', category: 'embed', snippet: '<Gallery></Gallery>' },
  { name: 'Video', label: '视频', category: 'embed', snippet: '<Video></Video>' },
  { name: 'Embed', label: '嵌入', category: 'embed', snippet: '<Embed></Embed>' },
  { name: 'Html', label: '自定义 HTML', category: 'embed', snippet: '<Html></Html>' },
];

function svgPath(path: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${path}"/></svg>`;
}

export function astroBlockIcon(category: AstroBlockCategory): string {
  return svgPath(CATEGORY_ICON[category] ?? mdiCodeTags);
}

const HTML_TAGS: Record<string, [string, string]> = {
  section: ['section', 'x-box x-width-full'],
  container: ['div', 'x-box x-pad-md'],
  stack: ['div', 'x-box x-stack x-dir-column x-gap-md'],
  grid: ['div', 'x-box x-grid x-gap-md'],
  columns: ['div', 'x-box x-grid x-cols-2 x-gap-md'],
  column: ['div', 'x-box'],
  card: ['article', 'x-box x-pad-md x-bg-surface x-card'],
  callout: ['aside', 'x-callout'],
  accordion: ['details', 'x-box x-pad-md'],
  tabs: ['div', 'x-box'],
  tabpanel: ['div', 'x-box x-pad-md'],
  text: ['p', ''],
  heading: ['h2', ''],
  richtext: ['div', 'x-prose'],
  quote: ['blockquote', 'x-quote x-box x-pad-md'],
  code: ['pre', 'x-code x-box x-pad-md'],
  badge: ['span', ''],
  button: ['span', 'x-button'],
  link: ['a', 'x-link'],
  icon: ['span', ''],
  divider: ['hr', ''],
  spacer: ['div', 'x-pad-md'],
  postlist: ['aside', 'x-box x-pad-md x-card'],
  postcard: ['article', 'x-box x-pad-md x-card'],
  categorytree: ['nav', 'x-box x-pad-md'],
  tagcloud: ['div', 'x-box x-pad-md'],
  pagination: ['nav', 'x-box x-pad-md'],
  profile: ['aside', 'x-box x-pad-md x-card'],
  toc: ['nav', 'x-box x-pad-md'],
  image: ['figure', 'x-box'],
  gallery: ['div', 'x-box x-grid x-gap-md'],
  video: ['div', 'x-box'],
  embed: ['div', 'x-box x-pad-md'],
  html: ['div', 'x-box'],
};

function rewriteHtmlString(html: string): string {
  let out = html;
  for (const [key, spec] of Object.entries(HTML_TAGS)) {
    const [tag, cls] = spec;
    const extra = cls ? ` class="${cls}"` : '';
    out = out.replace(new RegExp(`<${key}(\\s[^>]*)?>`, 'gi'), (_m, attrs = '') => {
      return `<${tag} data-xiao="${key}"${extra}${attrs}>`;
    });
    out = out.replace(new RegExp(`</${key}>`, 'gi'), `</${tag}>`);
  }
  return out;
}

function transformHtmlNode(node: ChildNode): Node {
  if (node.nodeType === 3) return document.createTextNode(node.textContent ?? '');
  if (node.nodeType !== 1) return document.createTextNode('');
  const el = node as Element;
  const key = el.tagName.toLowerCase();
  const spec = HTML_TAGS[key];
  const xiao = el.getAttribute('data-xiao') ?? (spec ? key : '');
  const out = document.createElement(spec?.[0] ?? el.tagName.toLowerCase());
  const cls = el.getAttribute('class') || spec?.[1] || '';
  if (cls) out.className = cls;
  if (xiao) out.setAttribute('data-xiao', xiao);
  const type = el.getAttribute('data-type');
  if (type) out.setAttribute('data-type', type);
  const href = el.getAttribute('href');
  if (href) out.setAttribute('href', href);
  for (const child of el.childNodes) out.appendChild(transformHtmlNode(child));
  return out;
}

export function paintXiaoHtml(host: HTMLElement, source: string): void {
  host.replaceChildren();
  const parsed = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  for (const child of parsed.body.childNodes) host.appendChild(transformHtmlNode(child));
}

const SPACE_VALUES = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
const BG_VALUES = ['default', 'primary', 'surface', 'muted', 'accent', 'inverse'] as const;
const COL_VALUES = ['1', '2', '3', '4'] as const;
const WIDTH_VALUES = ['narrow', 'prose', 'wide', 'full'] as const;
const TYPE_VALUES = ['info', 'tip', 'warn', 'danger'] as const;
const DIR_VALUES = ['column', 'row'] as const;
const ALIGN_VALUES = ['start', 'center', 'end'] as const;
const JUSTIFY_VALUES = ['start', 'center', 'end', 'between'] as const;
const RADIUS_VALUES = ['none', 'sm', 'md', 'lg', 'full'] as const;
const SHADOW_VALUES = ['none', 'sm', 'md', 'lg'] as const;
const BORDER_VALUES = ['none', 'subtle', 'strong'] as const;
const TEXT_VALUES = ['xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'] as const;
const WEIGHT_VALUES = ['normal', 'medium', 'bold'] as const;
const COLOR_VALUES = ['default', 'muted', 'primary'] as const;
const TALIGN_VALUES = ['start', 'center', 'end'] as const;

export const XIAO_CONTAINERS = new Set([
  'section',
  'container',
  'stack',
  'grid',
  'columns',
  'column',
  'card',
  'callout',
  'accordion',
  'tabs',
  'tabpanel',
  'quote',
  'gallery',
]);

export const SPACE_OPTIONS = SPACE_VALUES.map((value) => ({
  value,
  label: { none: '无', xs: '超小', sm: '小', md: '中', lg: '大', xl: '超大', '2xl': '特大' }[value],
}));
export const BG_OPTIONS = BG_VALUES.map((value) => ({
  value,
  label: {
    default: '默认',
    primary: '主色',
    surface: '表面',
    muted: '弱化',
    accent: '强调边',
    inverse: '反色',
  }[value],
}));
export const COL_OPTIONS = COL_VALUES.map((value) => ({ value, label: `${value} 列` }));
export const WIDTH_OPTIONS = WIDTH_VALUES.map((value) => ({
  value,
  label: { narrow: '窄', prose: '正文宽', wide: '宽', full: '通栏' }[value],
}));
export const TYPE_OPTIONS = TYPE_VALUES.map((value) => ({
  value,
  label: { info: '信息', tip: '提示', warn: '警告', danger: '危险' }[value],
}));
export const HEADING_OPTIONS = ['1', '2', '3', '4', '5', '6'].map((value) => ({
  value,
  label: `标题 ${value}`,
}));
export const DIR_OPTIONS = DIR_VALUES.map((value) => ({
  value,
  label: { column: '纵向', row: '横向' }[value],
}));
export const ALIGN_OPTIONS = ALIGN_VALUES.map((value) => ({
  value,
  label: { start: '起点', center: '居中', end: '终点' }[value],
}));
export const JUSTIFY_OPTIONS = JUSTIFY_VALUES.map((value) => ({
  value,
  label: { start: '起点', center: '居中', end: '终点', between: '两端' }[value],
}));
export const RADIUS_OPTIONS = RADIUS_VALUES.map((value) => ({
  value,
  label: { none: '无', sm: '小', md: '中', lg: '大', full: '全圆' }[value],
}));
export const SHADOW_OPTIONS = SHADOW_VALUES.map((value) => ({
  value,
  label: { none: '无', sm: '轻', md: '中', lg: '重' }[value],
}));
export const BORDER_OPTIONS = BORDER_VALUES.map((value) => ({
  value,
  label: { none: '无', subtle: '细线', strong: '粗线' }[value],
}));
export const TEXT_OPTIONS = TEXT_VALUES.map((value) => ({
  value,
  label: {
    xs: '超小',
    sm: '小',
    base: '默认',
    md: '中',
    lg: '大',
    xl: '加大',
    '2xl': '特大',
    '3xl': '超大',
  }[value],
}));
export const WEIGHT_OPTIONS = WEIGHT_VALUES.map((value) => ({
  value,
  label: { normal: '常规', medium: '中等', bold: '加粗' }[value],
}));
export const COLOR_OPTIONS = COLOR_VALUES.map((value) => ({
  value,
  label: { default: '正文', muted: '次要', primary: '主色' }[value],
}));
export const TALIGN_OPTIONS = TALIGN_VALUES.map((value) => ({
  value,
  label: { start: '左', center: '中', end: '右' }[value],
}));
export const INHERIT_OPTION = { value: '', label: '跟随电脑' };

/* ---------- 断点模型（与 packages/template/src/lib/breakpoints.ts 对齐） ---------- */

/** 站点配置里的一个断点；`base`（电脑/无前缀）是隐式的，不在列表里。 */
export interface Breakpoint {
  id: string;
  label: string;
  maxWidth: number;
}

export const MAX_BREAKPOINTS = 6;
export const MIN_BREAKPOINT_WIDTH = 320;
export const MAX_BREAKPOINT_WIDTH = 3840;
export const DEFAULT_BREAKPOINTS: readonly Breakpoint[] = [
  { id: 'md', label: '平板', maxWidth: 1023 },
  { id: 'sm', label: '手机', maxWidth: 767 },
];
/** 与 packages/template/src/lib/breakpoints.ts 保持一致：id 至少两个字符。 */
const BREAKPOINT_ID = /^[a-z][a-z0-9-]{1,16}$/;

export function cloneBreakpoints(list: readonly Breakpoint[]): Breakpoint[] {
  return list.map((item) => ({ ...item }));
}

/**
 * 校验 + 排序 + 兜底（与模板侧 resolveBreakpoints 同语义）：
 * 数量、id、宽度有任一非法或重复时整表回退默认；返回值按 maxWidth 升序。
 */
export function resolveBreakpoints(value: unknown): Breakpoint[] {
  const fallback = (): Breakpoint[] =>
    cloneBreakpoints(DEFAULT_BREAKPOINTS).sort((left, right) => left.maxWidth - right.maxWidth);
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_BREAKPOINTS)
    return fallback();
  const rows: Breakpoint[] = [];
  const ids = new Set<string>();
  const widths = new Set<number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return fallback();
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const label =
      typeof record.label === 'string' && record.label.trim() ? record.label.trim() : id;
    const maxWidth =
      typeof record.maxWidth === 'number' && Number.isInteger(record.maxWidth)
        ? record.maxWidth
        : Number.NaN;
    if (!BREAKPOINT_ID.test(id) || ids.has(id)) return fallback();
    if (
      !Number.isFinite(maxWidth) ||
      maxWidth < MIN_BREAKPOINT_WIDTH ||
      maxWidth > MAX_BREAKPOINT_WIDTH ||
      widths.has(maxWidth)
    ) {
      return fallback();
    }
    ids.add(id);
    widths.add(maxWidth);
    rows.push({ id, label, maxWidth });
  }
  return rows.sort((left, right) => left.maxWidth - right.maxWidth);
}

let activeBreakpoints: Breakpoint[] = cloneBreakpoints(DEFAULT_BREAKPOINTS).sort(
  (left, right) => left.maxWidth - right.maxWidth,
);

/** Editor 读到站点配置后调用；所有 parse/apply 默认使用这份表。 */
export function setBreakpoints(list: readonly Breakpoint[] | undefined): void {
  const next =
    list && list.length > 0 ? cloneBreakpoints(list) : cloneBreakpoints(DEFAULT_BREAKPOINTS);
  next.sort((left, right) => left.maxWidth - right.maxWidth);
  activeBreakpoints = next.slice(0, MAX_BREAKPOINTS);
}

export function getBreakpoints(): Breakpoint[] {
  return cloneBreakpoints(activeBreakpoints);
}

/** 检查器标签顺序：电脑 + 断点，断点按 maxWidth 降序（平板 → 手机）。 */
export function breakpointsDesc(list: readonly Breakpoint[] = activeBreakpoints): Breakpoint[] {
  return [...list].sort((left, right) => right.maxWidth - left.maxWidth);
}

/** 隐藏选项：desktop + 各断点 id（宽断点在前），类名是 `x-hide-<value>`。 */
export function hideOptions(
  list: readonly Breakpoint[] = activeBreakpoints,
): { value: string; label: string }[] {
  return [
    { value: 'desktop', label: '电脑隐藏' },
    ...breakpointsDesc(list).map((bp) => ({ value: bp.id, label: `${bp.label}隐藏` })),
  ];
}

/** 'base' 或某个断点 id；断点 id 来自站点配置。 */
export type StyleBreakpoint = 'base' | string;

export interface XiaoStyleTokens {
  pad: string;
  bg: string;
  cols: string;
  gap: string;
  width: string;
  direction: string;
  align: string;
  justify: string;
  radius: string;
  shadow: string;
  border: string;
  text: string;
  weight: string;
  color: string;
  talign: string;
}

export const EMPTY_STYLE: XiaoStyleTokens = {
  pad: '',
  bg: '',
  cols: '',
  gap: '',
  width: '',
  direction: '',
  align: '',
  justify: '',
  radius: '',
  shadow: '',
  border: '',
  text: '',
  weight: '',
  color: '',
  talign: '',
};

export interface XiaoBlockState {
  pos: number;
  html: string;
  key: string;
  label: string;
  texts: string[];
  type: string;
  heading: string;
  href: string;
  hide: string;
  base: XiaoStyleTokens;
  /** 各断点的覆盖样式：键是断点 id，没覆盖的项是空字符串。 */
  breakpoints: Record<string, XiaoStyleTokens>;
  pad: string;
  bg: string;
  cols: string;
  gap: string;
  width: string;
  direction: string;
  align: string;
  justify: string;
}

function tokenFromClass(className: string, prefix: string, allowed: readonly string[]): string {
  const hit = className.split(/\s+/).find((name) => {
    if (!name.startsWith(prefix)) return false;
    return allowed.includes(name.slice(prefix.length));
  });
  return hit ? hit.slice(prefix.length) : '';
}

function bpPrefix(bp: StyleBreakpoint): string {
  if (bp === 'base' || !BREAKPOINT_ID.test(bp)) return 'x-';
  return `x-${bp}-`;
}

function readTokens(
  className: string,
  bp: StyleBreakpoint,
  breakpoints: readonly Breakpoint[] = activeBreakpoints,
): XiaoStyleTokens {
  // 只读取配置里存在的断点，避免把旧 id 当成新档位。
  if (bp !== 'base' && !breakpoints.some((item) => item.id === bp)) return { ...EMPTY_STYLE };
  const p = bpPrefix(bp);
  return {
    pad: tokenFromClass(className, `${p}pad-`, SPACE_VALUES),
    bg: tokenFromClass(className, `${p}bg-`, BG_VALUES),
    cols: tokenFromClass(className, `${p}cols-`, COL_VALUES),
    gap: tokenFromClass(className, `${p}gap-`, SPACE_VALUES),
    width: tokenFromClass(className, `${p}width-`, WIDTH_VALUES),
    direction: tokenFromClass(className, `${p}dir-`, DIR_VALUES),
    align: tokenFromClass(className, `${p}align-`, ALIGN_VALUES),
    justify: tokenFromClass(className, `${p}justify-`, JUSTIFY_VALUES),
    radius: tokenFromClass(className, `${p}radius-`, RADIUS_VALUES),
    shadow: tokenFromClass(className, `${p}shadow-`, SHADOW_VALUES),
    border: tokenFromClass(className, `${p}border-`, BORDER_VALUES),
    text: tokenFromClass(className, `${p}text-`, TEXT_VALUES),
    weight: tokenFromClass(className, `${p}weight-`, WEIGHT_VALUES),
    color: tokenFromClass(className, `${p}color-`, COLOR_VALUES),
    talign: tokenFromClass(className, `${p}talign-`, TALIGN_VALUES),
  };
}

function writeToken(
  el: Element,
  bp: StyleBreakpoint,
  kind: keyof XiaoStyleTokens,
  value: string,
  breakpoints: readonly Breakpoint[] = activeBreakpoints,
): void {
  if (bp !== 'base' && !breakpoints.some((item) => item.id === bp)) return;
  const p = bpPrefix(bp);
  const map: Record<keyof XiaoStyleTokens, string> = {
    pad: 'pad',
    bg: 'bg',
    cols: 'cols',
    gap: 'gap',
    width: 'width',
    direction: 'dir',
    align: 'align',
    justify: 'justify',
    radius: 'radius',
    shadow: 'shadow',
    border: 'border',
    text: 'text',
    weight: 'weight',
    color: 'color',
    talign: 'talign',
  };
  const stem = map[kind];
  swapClass(el, new RegExp(`^${p}${stem}-`), value ? `${p}${stem}-${value}` : '');
}

function labelOf(key: string): string {
  const found = ASTRO_BLOCKS.find((item) => item.name.toLowerCase() === key);
  return found?.label ?? key;
}

export function textSlotLabel(key: string, index: number, total: number): string {
  if (key === 'columns' || key === 'grid' || key === 'stack') return `第 ${index + 1} 栏`;
  if (total > 1) return `文案 ${index + 1}`;
  return '文案';
}

const HIDE_CLASS = /^x-hide-([a-z][a-z0-9-]{1,16})$/;

export function parseXiaoHtml(
  html: string,
  pos = -1,
  breakpoints: readonly Breakpoint[] = activeBreakpoints,
): XiaoBlockState {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const root =
    [...parsed.body.children].find((el) => el.getAttribute('data-xiao')) ??
    parsed.body.firstElementChild;
  const key = root?.getAttribute('data-xiao') ?? '';
  const className = root?.getAttribute('class') ?? '';
  const textNodes = root ? [...root.querySelectorAll('[data-xiao="text"]')] : [];
  const texts = textNodes.map((el) => el.textContent ?? '');
  if (texts.length === 0 && root) {
    const fallback = (root.textContent ?? '').trim();
    if (fallback) texts.push(fallback);
  }
  const base = readTokens(className, 'base', breakpoints);
  const hideHit = className.split(/\s+/).find((name) => HIDE_CLASS.test(name));
  const hide = hideHit ? (HIDE_CLASS.exec(hideHit)?.[1] ?? '') : '';
  const bpTokens: Record<string, XiaoStyleTokens> = {};
  for (const bp of breakpoints) {
    bpTokens[bp.id] = readTokens(className, bp.id, breakpoints);
  }
  return {
    pos,
    html,
    key,
    label: labelOf(key),
    texts,
    type: root?.getAttribute('data-type') ?? '',
    heading: /^h[1-6]$/i.test(root?.tagName ?? '') ? root!.tagName.slice(1) : '',
    href: root?.getAttribute('href') ?? root?.querySelector('a')?.getAttribute('href') ?? '',
    hide,
    base,
    breakpoints: bpTokens,
    pad: base.pad,
    bg: base.bg,
    cols: base.cols,
    gap: base.gap,
    width: base.width,
    direction: base.direction,
    align: base.align,
    justify: base.justify,
  };
}

function swapClass(el: Element, pattern: RegExp, next: string): void {
  const names = el.className.split(/\s+/).filter((name) => name && !pattern.test(name));
  if (next) names.push(next);
  el.className = names.join(' ').trim();
}

function applyTokenPatch(
  root: Element,
  bp: StyleBreakpoint,
  tokens: Partial<XiaoStyleTokens>,
  breakpoints: readonly Breakpoint[] = activeBreakpoints,
): void {
  (Object.keys(tokens) as (keyof XiaoStyleTokens)[]).forEach((key) => {
    const value = tokens[key];
    if (value !== undefined) writeToken(root, bp, key, value, breakpoints);
  });
}

/** 补丁：样式可按断点分组，其它字段（文案/链接/隐藏等）保持单值。 */
export type XiaoBlockPatch = Partial<Omit<XiaoBlockState, 'breakpoints'>> & {
  breakpoints?: Record<string, Partial<XiaoStyleTokens>>;
};

export function applyXiaoHtml(
  html: string,
  patch: XiaoBlockPatch,
  breakpoints: readonly Breakpoint[] = activeBreakpoints,
): string {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  let root = parsed.body.firstElementChild;
  if (!root) return html;
  if (patch.base) applyTokenPatch(root, 'base', patch.base, breakpoints);
  if (patch.breakpoints) {
    for (const [bp, tokens] of Object.entries(patch.breakpoints)) {
      if (tokens) applyTokenPatch(root, bp, tokens, breakpoints);
    }
  }
  if (patch.pad !== undefined) writeToken(root, 'base', 'pad', patch.pad, breakpoints);
  if (patch.bg !== undefined) writeToken(root, 'base', 'bg', patch.bg, breakpoints);
  if (patch.cols !== undefined) writeToken(root, 'base', 'cols', patch.cols, breakpoints);
  if (patch.gap !== undefined) writeToken(root, 'base', 'gap', patch.gap, breakpoints);
  if (patch.width !== undefined) writeToken(root, 'base', 'width', patch.width, breakpoints);
  if (patch.direction !== undefined)
    writeToken(root, 'base', 'direction', patch.direction, breakpoints);
  if (patch.align !== undefined) writeToken(root, 'base', 'align', patch.align, breakpoints);
  if (patch.justify !== undefined) writeToken(root, 'base', 'justify', patch.justify, breakpoints);
  if (patch.hide !== undefined)
    swapClass(root, /^x-hide-/, patch.hide ? `x-hide-${patch.hide}` : '');
  if (patch.href !== undefined) {
    const link = root.tagName.toLowerCase() === 'a' ? root : root.querySelector('a');
    if (link) {
      if (patch.href) link.setAttribute('href', patch.href);
      else link.removeAttribute('href');
    } else if (
      patch.href &&
      (root.getAttribute('data-xiao') === 'button' || root.getAttribute('data-xiao') === 'link')
    ) {
      root.setAttribute('href', patch.href);
    }
  }
  if (patch.type !== undefined) {
    if (patch.type) root.setAttribute('data-type', patch.type);
    else root.removeAttribute('data-type');
  }
  if (
    patch.heading &&
    /^[1-6]$/.test(patch.heading) &&
    root.getAttribute('data-xiao') === 'heading'
  ) {
    const next = parsed.createElement(`h${patch.heading}`);
    next.className = root.className;
    for (const attr of root.attributes) next.setAttribute(attr.name, attr.value);
    while (root.firstChild) next.appendChild(root.firstChild);
    root.replaceWith(next);
    root = next;
  }
  if (patch.texts) {
    const nodes = [...root.querySelectorAll('[data-xiao="text"]')];
    if (nodes.length === 0 && patch.texts[0] !== undefined) root.textContent = patch.texts[0];
    else {
      patch.texts.forEach((text, index) => {
        const node = nodes[index];
        if (node) node.textContent = text;
      });
    }
  }
  return parsed.body.innerHTML;
}

/** 规格里的名字；与 applyXiaoHtml 等价，保留别名方便外部按规格调用。 */
export const applyBlockPatch = applyXiaoHtml;

const BOX_KEYS = new Set([
  'section',
  'container',
  'stack',
  'grid',
  'columns',
  'column',
  'card',
  'callout',
  'accordion',
  'tabs',
  'tabpanel',
  'quote',
  'code',
  'spacer',
  'gallery',
  'embed',
  'html',
  'postlist',
  'postcard',
  'profile',
  'image',
  'video',
]);
const TEXT_KEYS = new Set([
  'text',
  'heading',
  'richtext',
  'button',
  'badge',
  'link',
  'quote',
  'callout',
]);

export function hasStyleField(
  state: XiaoBlockState,
  field: keyof XiaoStyleTokens | 'type' | 'heading' | 'href' | 'hide',
): boolean {
  const key = state.key;
  if (!key) return false;
  if (field === 'heading') return key === 'heading';
  if (field === 'type') return key === 'callout';
  if (field === 'href') return key === 'button' || key === 'link';
  if (field === 'hide') return key !== 'divider' && key !== 'icon';
  if (field === 'cols') return key === 'columns' || key === 'grid';
  if (field === 'gap') return key === 'columns' || key === 'grid' || key === 'stack';
  if (field === 'direction') return key === 'stack';
  if (field === 'align') return key === 'stack' || key === 'columns' || key === 'grid';
  if (field === 'justify') return key === 'stack';
  if (field === 'width') return BOX_KEYS.has(key) && key !== 'column';
  if (field === 'text' || field === 'weight' || field === 'color' || field === 'talign')
    return TEXT_KEYS.has(key);
  if (
    field === 'pad' ||
    field === 'bg' ||
    field === 'radius' ||
    field === 'shadow' ||
    field === 'border'
  ) {
    return BOX_KEYS.has(key) || key === 'button';
  }
  return false;
}

export function tokensFor(state: XiaoBlockState, bp: StyleBreakpoint): XiaoStyleTokens {
  if (bp === 'base') return state.base;
  return state.breakpoints[bp] ?? EMPTY_STYLE;
}

let pickHandler: ((block: XiaoBlockState | null) => void) | undefined;
type HtmlDoc = {
  nodeAt: (pos: number) => { type: { name: string }; attrs: Record<string, unknown> } | null;
  descendants: (fn: (node: { type: { name: string } }, pos: number) => boolean | void) => void;
};

let lastView:
  | {
      state: {
        doc: HtmlDoc;
        tr: {
          setNodeMarkup: (pos: number, type: undefined, attrs: Record<string, unknown>) => unknown;
        };
      };
      dispatch: (tr: unknown) => void;
    }
  | undefined;
let lastParser:
  ((markdown: string) => { childCount: number; slice: (from: number) => unknown }) | undefined;

export function setHtmlPickHandler(
  handler: ((block: XiaoBlockState | null) => void) | undefined,
): void {
  pickHandler = handler;
}

function findHtmlPos(
  doc: {
    descendants: (fn: (node: { type: { name: string } }, pos: number) => boolean | void) => void;
    nodeAt: (pos: number) => { type: { name: string }; attrs: Record<string, unknown> } | null;
  },
  start: number,
): number | null {
  const direct = doc.nodeAt(start);
  if (direct?.type.name === 'html') return start;
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found != null) return false;
    if (node.type.name === 'html' && Math.abs(pos - start) <= 4) {
      found = pos;
      return false;
    }
    return undefined;
  });
  return found;
}

export function writeHtmlNode(pos: number, html: string): number | null {
  const view = lastView;
  if (!view) return null;
  const resolved = findHtmlPos(view.state.doc, pos);
  if (resolved == null) return null;
  const node = view.state.doc.nodeAt(resolved);
  if (!node || node.type.name !== 'html') return null;
  view.dispatch(view.state.tr.setNodeMarkup(resolved, undefined, { ...node.attrs, value: html }));
  return resolved;
}

function resolvePos(getPos: unknown): number | null {
  if (typeof getPos === 'number') return getPos;
  if (typeof getPos === 'function') {
    const pos = getPos();
    return typeof pos === 'number' ? pos : null;
  }
  return null;
}

function markSelected(dom: HTMLElement): void {
  document
    .querySelectorAll('.xiao-html.is-selected')
    .forEach((el) => el.classList.remove('is-selected'));
  dom.classList.add('is-selected');
}

export function clearHtmlSelection(): void {
  document
    .querySelectorAll('.xiao-html.is-selected')
    .forEach((el) => el.classList.remove('is-selected'));
  pickHandler?.(null);
}

const WIDTH_PX: Record<string, number> = { narrow: 560, prose: 720, wide: 1200, full: 1600 };
const PAD_PX: Record<string, number> = { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 40, '2xl': 64 };

/** 画布缩放系数：拖柄的屏幕位移要除以它才能换算成未缩放的 CSS 像素。 */
let canvasScale = 1;

export function setCanvasScale(scale: number): void {
  canvasScale = Number.isFinite(scale) && scale > 0.1 ? scale : 1;
}

export function getCanvasScale(): number {
  return canvasScale;
}

function snapToken(px: number, table: Record<string, number>, allowed: readonly string[]): string {
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

function makeHandle(edge: 'drag' | 'width' | 'pad'): HTMLElement {
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = `xiao-html__handle xiao-html__handle--${edge}`;
  handle.tabIndex = -1;
  handle.setAttribute(
    'aria-label',
    edge === 'drag' ? '拖动排序' : edge === 'width' ? '宽度' : '内边距',
  );
  return handle;
}

export function moveHtmlNode(
  fromPos: number,
  towardPos: number,
  place: 'before' | 'after',
): number | null {
  const view = lastView as
    | {
        state: {
          doc: { nodeAt: (pos: number) => { type: { name: string }; nodeSize: number } | null };
          tr: {
            delete: (
              from: number,
              to: number,
            ) => { insert: (pos: number, node: unknown) => unknown };
          };
        };
        dispatch: (tr: unknown) => void;
      }
    | undefined;
  if (!view) return null;
  const node = view.state.doc.nodeAt(fromPos);
  const target = view.state.doc.nodeAt(towardPos);
  if (!node || node.type.name !== 'html' || !target) return null;
  if (fromPos === towardPos) return fromPos;
  let dest = place === 'after' ? towardPos + target.nodeSize : towardPos;
  const size = node.nodeSize;
  const tr = view.state.tr.delete(fromPos, fromPos + size);
  if (dest > fromPos) dest -= size;
  const inserted = tr.insert(dest, node);
  view.dispatch(inserted);
  return dest;
}

export function createHtmlView(
  node: { attrs: { value?: string } },
  _view: unknown,
  getPos: unknown,
): {
  dom: HTMLElement;
  update: (next: { type: { name: string }; attrs: { value?: string } }) => boolean;
  destroy: () => void;
} {
  const dom = document.createElement('span');
  dom.className = 'xiao-html';
  const content = document.createElement('span');
  content.className = 'xiao-html__body';
  const dragHandle = makeHandle('drag');
  const widthHandle = makeHandle('width');
  const padHandle = makeHandle('pad');
  dom.append(dragHandle, content, widthHandle, padHandle);
  let current = node;
  paintXiaoHtml(content, current.attrs.value ?? '');

  const selectSelf = (): XiaoBlockState | null => {
    const pos = resolvePos(getPos);
    if (pos == null) return null;
    markSelected(dom);
    const state = parseXiaoHtml(current.attrs.value ?? '', pos);
    pickHandler?.(state);
    widthHandle.hidden = !hasStyleField(state, 'width');
    padHandle.hidden = !hasStyleField(state, 'pad');
    return state;
  };

  const onMouseDown = (event: Event) => {
    if (event.target instanceof HTMLElement && event.target.classList.contains('xiao-html__handle'))
      return;
    event.preventDefault();
    event.stopPropagation();
    selectSelf();
  };

  let dragFrom: number | null = null;
  const onDragStart = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = resolvePos(getPos);
    if (pos == null) return;
    selectSelf();
    dragFrom = pos;
    dragHandle.setPointerCapture(event.pointerId);
  };
  const onDragMove = (event: PointerEvent) => {
    if (dragFrom == null) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('.xiao-html');
    document.querySelectorAll('.xiao-html.is-drop').forEach((el) => el.classList.remove('is-drop'));
    if (under instanceof HTMLElement && under !== dom) under.classList.add('is-drop');
  };
  const onDragEnd = (event: PointerEvent) => {
    if (dragFrom == null) return;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('.xiao-html');
    document.querySelectorAll('.xiao-html.is-drop').forEach((el) => el.classList.remove('is-drop'));
    const from = dragFrom;
    dragFrom = null;
    if (!(under instanceof HTMLElement) || under === dom) return;
    const targetPos = Number(under.dataset.pos ?? '');
    if (!Number.isFinite(targetPos)) return;
    const rect = under.getBoundingClientRect();
    // 用缩放后的 rect.height：画布 transform 缩放时 clientHeight 不是屏幕高度。
    const place: 'before' | 'after' =
      event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    const next = moveHtmlNode(from, targetPos, place);
    if (next != null) pickHandler?.(parseXiaoHtml(current.attrs.value ?? '', next));
  };

  const pos0 = resolvePos(getPos);
  if (pos0 != null) dom.dataset.pos = String(pos0);

  let resizing: { prop: 'width' | 'pad'; start: number; startPx: number } | null = null;
  const onResizeStart = (event: PointerEvent, prop: 'width' | 'pad') => {
    event.preventDefault();
    event.stopPropagation();
    const state = selectSelf();
    if (!state) return;
    // offsetWidth 是未缩放的布局宽度；画布缩放时不能用 getBoundingClientRect。
    resizing = {
      prop,
      start: prop === 'width' ? event.clientX : event.clientY,
      startPx: prop === 'width' ? content.offsetWidth : (PAD_PX[state.pad] ?? 16),
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onResizeMove = (event: PointerEvent) => {
    if (!resizing) return;
    // 屏幕位移除以画布缩放，换算成 token 对应的未缩放像素。
    const scale = getCanvasScale();
    const delta =
      (resizing.prop === 'width'
        ? event.clientX - resizing.start
        : resizing.start - event.clientY) / scale;
    const px = Math.max(0, resizing.startPx + delta);
    const next =
      resizing.prop === 'width'
        ? snapToken(px, WIDTH_PX, WIDTH_VALUES)
        : snapToken(px, PAD_PX, SPACE_VALUES);
    const html = applyXiaoHtml(current.attrs.value ?? '', { [resizing.prop]: next });
    const pos = resolvePos(getPos);
    if (pos == null) return;
    const written = writeHtmlNode(pos, html);
    if (written == null) return;
    current = { attrs: { value: html } };
    paintXiaoHtml(content, html);
    pickHandler?.(parseXiaoHtml(html, written));
  };
  const onResizeEnd = () => {
    resizing = null;
  };

  content.addEventListener('mousedown', onMouseDown);
  dragHandle.addEventListener('pointerdown', onDragStart);
  dragHandle.addEventListener('pointermove', onDragMove);
  dragHandle.addEventListener('pointerup', onDragEnd);
  widthHandle.addEventListener('pointerdown', (event) => onResizeStart(event, 'width'));
  padHandle.addEventListener('pointerdown', (event) => onResizeStart(event, 'pad'));
  widthHandle.addEventListener('pointermove', onResizeMove);
  padHandle.addEventListener('pointermove', onResizeMove);
  widthHandle.addEventListener('pointerup', onResizeEnd);
  padHandle.addEventListener('pointerup', onResizeEnd);
  widthHandle.hidden = true;
  padHandle.hidden = true;

  return {
    dom,
    update(next) {
      if (next.type.name !== 'html') return false;
      current = next;
      paintXiaoHtml(content, next.attrs.value ?? '');
      const pos = resolvePos(getPos);
      if (pos != null) dom.dataset.pos = String(pos);
      return true;
    },
    destroy() {
      content.removeEventListener('mousedown', onMouseDown);
      dragHandle.removeEventListener('pointerdown', onDragStart);
      dragHandle.removeEventListener('pointermove', onDragMove);
      dragHandle.removeEventListener('pointerup', onDragEnd);
    },
  };
}

export function attachHtmlNodeViews(ctx: unknown): void {
  const bag = ctx as { get: (name: string) => unknown };
  const view = bag.get('editorView') as
    | {
        props: { nodeViews?: Record<string, unknown> };
        setProps: (props: { nodeViews: Record<string, unknown> }) => void;
        state: {
          doc: HtmlDoc;
          tr: {
            setNodeMarkup: (
              pos: number,
              type: undefined,
              attrs: Record<string, unknown>,
            ) => unknown;
          };
        };
        dispatch: (tr: unknown) => void;
      }
    | undefined;
  if (!view?.setProps) return;
  lastView = view;
  lastParser = bag.get('parser') as typeof lastParser;
  view.setProps({
    nodeViews: {
      ...(view.props.nodeViews ?? {}),
      html: (node: { attrs: { value?: string } }, innerView: unknown, getPos: unknown) =>
        createHtmlView(node, innerView, getPos),
    },
  });
}

interface ProseTr {
  delete: (from: number, to: number) => ProseTr;
  insertText: (text: string, from?: number, to?: number) => ProseTr;
  replaceSelection: (slice: unknown) => ProseTr;
  scrollIntoView: () => ProseTr;
}

interface ProseView {
  state: {
    selection: { $from: { start: () => number; end: () => number } };
    tr: ProseTr;
  };
  dispatch: (tr: unknown) => void;
  focus: () => void;
}

interface ParsedDoc {
  childCount: number;
  slice: (from: number) => unknown;
}

export function insertAstroSnippet(ctx: unknown, snippet: string): void {
  const bag = ctx as { get: (name: string) => unknown };
  const view = bag.get('editorView') as ProseView | undefined;
  const parser = bag.get('parser') as ((markdown: string) => ParsedDoc) | undefined;
  if (!view) return;
  const trimmed = rewriteHtmlString(snippet.trim());
  view.focus();
  const { state, dispatch } = view;
  const { $from } = state.selection;
  const tr = state.tr.delete($from.start(), $from.end());
  if (typeof parser === 'function') {
    const parsed = parser(`\n\n${trimmed}\n\n`);
    if (parsed && parsed.childCount > 0) {
      dispatch(tr.replaceSelection(parsed.slice(0)).scrollIntoView());
      return;
    }
  }
  dispatch(tr.insertText(`${trimmed}\n`).scrollIntoView());
}

export function insertXiaoBlock(snippet: string): boolean {
  const view = lastView as ProseView | undefined;
  if (!view) return false;
  insertAstroSnippet(
    {
      get: (name: string) => {
        if (name === 'editorView') return view;
        if (name === 'parser') return lastParser;
        return undefined;
      },
    },
    snippet,
  );
  return true;
}

export type DropTarget =
  { mode: 'into' | 'before' | 'after'; htmlPos: number } | { mode: 'doc'; pos: number };

export function dropPosition(x: number, y: number): DropTarget | null {
  const under = document.elementFromPoint(x, y);
  const host = under instanceof Element ? under.closest('.xiao-html') : null;
  if (host instanceof HTMLElement && host.dataset.pos) {
    const htmlPos = Number(host.dataset.pos);
    if (!Number.isFinite(htmlPos)) return null;
    const key = host.querySelector('[data-xiao]')?.getAttribute('data-xiao') ?? '';
    const rect = host.getBoundingClientRect();
    const rel = (y - rect.top) / Math.max(1, rect.height);
    if (XIAO_CONTAINERS.has(key) && rel > 0.25 && rel < 0.75) return { mode: 'into', htmlPos };
    return { mode: rel < 0.5 ? 'before' : 'after', htmlPos };
  }
  const view = lastView as
    { posAtCoords?: (coords: { left: number; top: number }) => { pos: number } | null } | undefined;
  const hit = view?.posAtCoords?.({ left: x, top: y });
  if (hit && typeof hit.pos === 'number') return { mode: 'doc', pos: hit.pos };
  return null;
}

export function insertXiaoBlockAt(snippet: string, target: DropTarget | null): boolean {
  if (!target) return insertXiaoBlock(snippet);
  const html = rewriteHtmlString(snippet.trim());
  const view = lastView as
    | {
        focus: () => void;
        dispatch: (tr: unknown) => void;
        state: {
          doc: {
            nodeAt: (pos: number) => {
              type: { name: string };
              nodeSize: number;
              attrs: Record<string, unknown>;
            } | null;
          };
          tr: { replace: (from: number, to: number, slice: unknown) => unknown };
        };
      }
    | undefined;
  if (target.mode === 'into') {
    if (!view) return false;
    const node = view.state.doc.nodeAt(target.htmlPos);
    if (!node || node.type.name !== 'html') return insertXiaoBlock(snippet);
    const parsed = new DOMParser().parseFromString(
      `<body>${String(node.attrs.value ?? '')}</body>`,
      'text/html',
    );
    const root = parsed.body.firstElementChild;
    if (!root) return false;
    const wrap = parsed.createElement('div');
    wrap.innerHTML = html;
    while (wrap.firstChild) root.appendChild(wrap.firstChild);
    writeHtmlNode(target.htmlPos, parsed.body.innerHTML);
    return true;
  }
  if (!view || !lastParser) return insertXiaoBlock(snippet);
  const parsed = lastParser(`\n\n${html}\n\n`);
  if (!parsed || parsed.childCount === 0) return insertXiaoBlock(snippet);
  let dest = target.mode === 'doc' ? target.pos : target.htmlPos;
  if (target.mode === 'after') {
    const node = view.state.doc.nodeAt(target.htmlPos);
    dest = target.htmlPos + (node?.nodeSize ?? 0);
  }
  view.focus();
  view.dispatch(view.state.tr.replace(dest, dest, parsed.slice(0)));
  return true;
}

export function registerAstroSlashGroups(builder: {
  addGroup: (
    key: string,
    label: string,
  ) => {
    addItem: (
      key: string,
      item: { label: string; icon: string; onRun: (ctx: unknown) => void },
    ) => unknown;
  };
}): void {
  for (const category of ASTRO_CATEGORY_ORDER) {
    const group = builder.addGroup(`astro-${category}`, ASTRO_CATEGORY_LABEL[category]);
    const icon = astroBlockIcon(category);
    for (const block of ASTRO_BLOCKS.filter((item) => item.category === category)) {
      group.addItem(block.name, {
        label: block.label,
        icon,
        onRun: (ctx) => insertAstroSnippet(ctx, block.snippet),
      });
    }
  }
}
