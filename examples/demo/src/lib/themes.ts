/**
 * 默认主题的设计令牌尺寸表与主题声明文件（src/theme.json）的类型。
 *
 * 约定（D-99）：
 * - 主题配色只是颜色，色板数据在 src/theme.json 的 palettes 里，模板和 Studio 都读那份文件。
 * - 字体、字号、行高、密度、圆角、宽度、阴影、动效是主题自定义项，取值表在这里，
 *   默认值和可选项同样声明在 src/theme.json 的 options 里。
 * - 最终令牌由 lib/config.ts 的 resolveTheme() 合并。
 */

export type ColorSchemeId = 'auto' | 'light' | 'dark';
export type FontId = 'sans' | 'serif' | 'mono' | 'custom';
/** 1.x 遗留值：主题字体允许 mono-heading，作为 mono 的兼容写法保留。 */
export type LegacyFontId = FontId | 'mono-heading';
export type ScaleId = 'compact' | 'normal' | 'spacious';
export type LineHeightId = 'tight' | 'normal' | 'loose';
export type DensityId = 'compact' | 'normal';
export type RadiusId = 'none' | 'sm' | 'md' | 'lg' | 'pill';
export type ContentWidthId = 'narrow' | 'prose' | 'wide' | 'full';
export type ShadowId = 'none' | 'soft' | 'strong';

/** 一套色板。键名与 xiao.config.json 的 theme.colors.light / .dark 一致。 */
export interface Palette {
  accent: string;
  /** 文字级强调。缺省时沿用 accent。亮色小字不能直接用过浅的 accent。 */
  accentInk?: string;
  accentSoft: string;
  onAccent: string;
  bg: string;
  surface: string;
  text: string;
  text2: string;
  text3: string;
  line: string;
  scrim: string;
}

/** 主题声明文件里的一套配色。 */
export interface PaletteDef {
  id: string;
  name: string;
  summary?: string;
  light: Palette;
  dark: Palette;
}

export type OptionValue = string | boolean | string[];

/** 主题声明的一个自定义项；Studio 外观页按 type 生成控件。 */
export interface ThemeOptionDef {
  key: string;
  group?: string;
  label: string;
  hint?: string;
  placeholder?: string;
  type: 'select' | 'segmented' | 'switch' | 'text' | 'textarea' | 'checks';
  default: OptionValue;
  choices?: { value: string; label: string }[];
  /** 只有另一个项等于某值时才显示，比如字体选「自定义」才显示字体栈。 */
  when?: { key: string; value: string };
}

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  summary?: string;
  palettes: { default: string; items: PaletteDef[] };
  options: ThemeOptionDef[];
}

/** 字体栈。sans 与 serif 的第 1、2 项与 1.x 完全一致，避免旧站点字形漂移。 */
export const FONT_STACKS: Record<FontId, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  serif: "'Palatino Linotype', 'Songti SC', 'Noto Serif SC', Georgia, serif",
  mono: "ui-monospace, 'Cascadia Code', 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  custom: '',
};

/** 字号倍率：scale 同时作用于字号与间距（验收要求按钮/卡片/正文一起变）。 */
export const SCALE_FACTOR: Record<ScaleId, number> = {
  compact: 0.9,
  normal: 1,
  spacious: 1.12,
};

/** 密度只再压缩间距，不缩字号。 */
export const DENSITY_FACTOR: Record<DensityId, number> = {
  compact: 0.85,
  normal: 1,
};

/** 基准字号（scale=normal 时的像素值，等于 1.x 的取值）。 */
export const BASE_FONT_SIZES = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 22,
  '3xl': 30,
  bodySm: 15,
  '3xlMobile': 26,
} as const;

/** 间距刻度 1..8（scale=normal、density=normal 时的像素值）。 */
export const BASE_SPACES = [4, 8, 12, 16, 24, 32, 48, 64] as const;

export const LINE_HEIGHTS: Record<LineHeightId, { body: number; heading: number }> = {
  tight: { body: 1.6, heading: 1.25 },
  normal: { body: 1.8, heading: 1.35 },
  loose: { body: 2, heading: 1.5 },
};

/**
 * 圆角梯度。md 一行必须与 1.x 的取值一致（卡片 12 / 小控件 6 / 中等 8 / 行内码 4 / 胶囊 999），
 * 这样旧配置（radius=md，也是默认值）像素级不变。
 */
export const RADII: Record<
  RadiusId,
  { base: string; xs: string; sm: string; md: string; lg: string; pill: string }
> = {
  none: { base: '0px', xs: '0px', sm: '0px', md: '0px', lg: '0px', pill: '999px' },
  sm: { base: '6px', xs: '3px', sm: '4px', md: '5px', lg: '6px', pill: '999px' },
  md: { base: '12px', xs: '4px', sm: '6px', md: '8px', lg: '12px', pill: '999px' },
  lg: { base: '20px', xs: '6px', sm: '10px', md: '14px', lg: '20px', pill: '999px' },
  pill: { base: '999px', xs: '8px', sm: '12px', md: '16px', lg: '999px', pill: '999px' },
};

export const SHADOWS: Record<ShadowId, { one: string; two: string }> = {
  none: { one: 'none', two: 'none' },
  soft: { one: '0 1px 2px rgb(0 0 0 / 6%)', two: '0 8px 24px rgb(0 0 0 / 8%)' },
  strong: { one: '0 2px 4px rgb(0 0 0 / 14%)', two: '0 16px 40px rgb(0 0 0 / 20%)' },
};

/** contentWidth 对应的正文列宽。full 直接给 1fr，交给 grid 的 minmax() 吸收。 */
export const CONTENT_WIDTHS: Record<ContentWidthId, string> = {
  narrow: '560px',
  prose: '720px',
  wide: '1200px',
  full: '1fr',
};

/** 动效时长。motion=false 时全部归零，prefers-reduced-motion 仍然在 CSS 里兜底。 */
export const DURATIONS = { normal: '150ms', slow: '200ms' };

export const COLOR_KEYS = [
  'accent',
  'accentInk',
  'accentSoft',
  'onAccent',
  'bg',
  'surface',
  'text',
  'text2',
  'text3',
  'line',
  'scrim',
] as const;

/** Palette 键 → CSS 变量名。 */
export const COLOR_VARS: Record<keyof Palette, string> = {
  accent: '--color-accent',
  accentInk: '--color-accent-ink',
  accentSoft: '--color-accent-soft',
  onAccent: '--color-on-accent',
  bg: '--color-bg',
  surface: '--color-surface',
  text: '--color-text',
  text2: '--color-text-2',
  text3: '--color-text-3',
  line: '--color-line',
  scrim: '--color-scrim',
};
