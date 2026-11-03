/**
 * HTML 文章的块样式令牌。
 *
 * 样式不写内联 style，全部落到站点 xiao.css 的 class 令牌上：
 * 构建、手改、导出都还是一条路。面板只增删自己认识的那组令牌，
 * 别的 class 原样保留。
 */

export interface TokenOption {
  value: string;
  label: string;
}

export interface TokenGroup {
  key: string;
  label: string;
  options: TokenOption[];
}

function options(entries: ReadonlyArray<readonly [string, string]>): TokenOption[] {
  return entries.map(([value, label]) => ({ value, label }));
}

export const TOKEN_GROUPS: Record<string, TokenGroup> = {
  width: {
    key: 'width',
    label: '宽度',
    options: options([
      ['', '默认'],
      ['x-width-narrow', '窄'],
      ['x-width-prose', '正文宽'],
      ['x-width-wide', '宽'],
      ['x-width-full', '通栏'],
    ]),
  },
  pad: {
    key: 'pad',
    label: '内边距',
    options: options([
      ['', '默认'],
      ['x-pad-none', '无'],
      ['x-pad-xs', '超小'],
      ['x-pad-sm', '小'],
      ['x-pad-md', '中'],
      ['x-pad-lg', '大'],
      ['x-pad-xl', '超大'],
      ['x-pad-2xl', '特大'],
    ]),
  },
  marginTop: {
    key: 'marginTop',
    label: '上外边距',
    options: options([
      ['', '默认'],
      ['x-mt-none', '无'],
      ['x-mt-xs', '超小'],
      ['x-mt-sm', '小'],
      ['x-mt-md', '中'],
      ['x-mt-lg', '大'],
      ['x-mt-xl', '超大'],
      ['x-mt-2xl', '特大'],
    ]),
  },
  marginBottom: {
    key: 'marginBottom',
    label: '下外边距',
    options: options([
      ['', '默认'],
      ['x-mb-none', '无'],
      ['x-mb-xs', '超小'],
      ['x-mb-sm', '小'],
      ['x-mb-md', '中'],
      ['x-mb-lg', '大'],
      ['x-mb-xl', '超大'],
      ['x-mb-2xl', '特大'],
    ]),
  },
  span: {
    key: 'span',
    label: '跨列',
    options: options([
      ['', '默认'],
      ['x-span-1', '1 列'],
      ['x-span-2', '2 列'],
      ['x-span-3', '3 列'],
      ['x-span-4', '4 列'],
      ['x-span-full', '整行'],
    ]),
  },
  bg: {
    key: 'bg',
    label: '背景',
    options: options([
      ['', '默认'],
      ['x-bg-default', '页面底'],
      ['x-bg-surface', '表面'],
      ['x-bg-primary', '主色'],
      ['x-bg-accent', '强调'],
      ['x-bg-inverse', '反色'],
    ]),
  },
  radius: {
    key: 'radius',
    label: '圆角',
    options: options([
      ['', '默认'],
      ['x-radius-none', '无'],
      ['x-radius-sm', '小'],
      ['x-radius-md', '中'],
      ['x-radius-lg', '大'],
      ['x-radius-full', '全圆'],
    ]),
  },
  border: {
    key: 'border',
    label: '描边',
    options: options([
      ['', '默认'],
      ['x-border-none', '无'],
      ['x-border-subtle', '细'],
      ['x-border-strong', '强'],
    ]),
  },
  shadow: {
    key: 'shadow',
    label: '阴影',
    options: options([
      ['', '默认'],
      ['x-shadow-none', '无'],
      ['x-shadow-sm', '小'],
      ['x-shadow-md', '中'],
      ['x-shadow-lg', '大'],
    ]),
  },
  textSize: {
    key: 'textSize',
    label: '字号',
    options: options([
      ['', '默认'],
      ['x-text-xs', 'xs'],
      ['x-text-sm', 'sm'],
      ['x-text-base', 'base'],
      ['x-text-md', 'md'],
      ['x-text-lg', 'lg'],
      ['x-text-xl', 'xl'],
      ['x-text-2xl', '2xl'],
      ['x-text-3xl', '3xl'],
    ]),
  },
  weight: {
    key: 'weight',
    label: '字重',
    options: options([
      ['', '默认'],
      ['x-weight-normal', '常规'],
      ['x-weight-medium', '中等'],
      ['x-weight-bold', '加粗'],
    ]),
  },
  color: {
    key: 'color',
    label: '文字颜色',
    options: options([
      ['', '默认'],
      ['x-color-default', '正文'],
      ['x-color-muted', '弱化'],
      ['x-color-primary', '主色'],
    ]),
  },
  align: {
    key: 'align',
    label: '对齐',
    options: options([
      ['', '默认'],
      ['x-talign-start', '左'],
      ['x-talign-center', '居中'],
      ['x-talign-end', '右'],
    ]),
  },
  cols: {
    key: 'cols',
    label: '多栏',
    options: options([
      ['', '单栏'],
      ['x-cols-2', '两栏'],
      ['x-cols-3', '三栏'],
      ['x-cols-4', '四栏'],
    ]),
  },
  gap: {
    key: 'gap',
    label: '栏间距',
    options: options([
      ['', '默认'],
      ['x-gap-none', '无'],
      ['x-gap-xs', '超小'],
      ['x-gap-sm', '小'],
      ['x-gap-md', '中'],
      ['x-gap-lg', '大'],
      ['x-gap-xl', '超大'],
      ['x-gap-2xl', '特大'],
    ]),
  },
};

export const IMAGE_RATIOS: TokenOption[] = options([
  ['auto', '自适应'],
  ['1x1', '方形'],
  ['4x3', '标准'],
  ['16x9', '宽屏'],
  ['21x9', '超宽'],
]);

export const CALLOUT_TYPES: TokenOption[] = options([
  ['info', '信息'],
  ['tip', '提示'],
  ['warn', '警告'],
  ['danger', '危险'],
]);

export interface HtmlBlockInfo {
  index: number;
  type: string;
  label: string;
  classes: string[];
  attrs: Record<string, string | number>;
  text: string;
  canStyle: boolean;
  canColumns: boolean;
  isText: boolean;
  isImage: boolean;
  isButton: boolean;
  isCallout: boolean;
  isColumns: boolean;
}

export const STYLEABLE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bullet_list',
  'ordered_list',
  'code_block',
  'image',
  'callout',
  'card',
  'columns',
  'column',
  'button',
]);

export const TEXT_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bullet_list',
  'ordered_list',
  'code_block',
  'button',
]);

export function splitClasses(value: unknown): string[] {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean);
}

export function groupValue(classes: string[], key: string): string {
  const group = TOKEN_GROUPS[key];
  if (!group) return '';
  const found = group.options.find((option) => option.value && classes.includes(option.value));
  return found?.value ?? '';
}

export function withGroupValue(classes: string[], key: string, value: string): string[] {
  const group = TOKEN_GROUPS[key];
  if (!group) return classes;
  const managed = new Set(group.options.map((option) => option.value).filter(Boolean));
  const next = classes.filter((token) => !managed.has(token));
  if (value) next.push(value);
  return [...new Set(next)];
}

export function withColumnsValue(classes: string[], value: string): string[] {
  const next = withGroupValue(classes, 'cols', value);
  if (value && !next.includes('x-grid')) next.push('x-grid');
  if (!value && !next.some((token) => /^x-cols-\d$/.test(token))) {
    return next.filter((token) => token !== 'x-grid');
  }
  return next;
}

export function hideTokens(classes: string[]): string[] {
  return classes.filter((token) => token.startsWith('x-hide-'));
}

export function toggleHide(classes: string[], token: string, on: boolean): string[] {
  const next = classes.filter((item) => item !== token);
  if (on) next.push(token);
  return [...new Set(next)];
}
