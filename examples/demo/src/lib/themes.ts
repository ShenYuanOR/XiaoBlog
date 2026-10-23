/**
 * 站点主题预设与设计令牌的取值表。
 *
 * 约定（见 .agents/specs/theme-system.md）：
 * - 这里只放「数据 + 尺度表」，不碰 DOM；最终令牌由 lib/config.ts 的 resolveTheme() 合并。
 * - 6 套预设都提供完整的亮/暗两套色板，任何显式 theme 字段优先于预设。
 * - 旧配置（没有 theme.preset）继续走 --hue 派生逻辑，色板不在这里定义，避免颜色突变。
 */

export type PresetId = 'midnight' | 'paper' | 'magazine' | 'terminal' | 'warm' | 'minimal';
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

export interface ThemePreset {
  id: PresetId;
  name: string;
  summary: string;
  colors: { light: Palette; dark: Palette };
  font: LegacyFontId;
  headingWeight: number;
  scale: ScaleId;
  lineHeight: LineHeightId;
  density: DensityId;
  radius: RadiusId;
  contentWidth: ContentWidthId;
  shadow: ShadowId;
  motion: boolean;
}

export const PRESET_IDS: PresetId[] = [
  'midnight',
  'paper',
  'magazine',
  'terminal',
  'warm',
  'minimal',
];

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

/**
 * 6 套预设。midnight 是 2.0 默认（深色专业风：墨蓝底 + 蓝强调）。
 * 色板取 studio-ui-v2.md §3 的同一族色值，让 Studio 与站点观感一致。
 */
export const PRESETS: Record<PresetId, ThemePreset> = {
  midnight: {
    id: 'midnight',
    name: '深夜',
    summary: '默认。深色专业风，墨蓝底配蓝色强调。',
    colors: {
      light: {
        accent: '#2f6bf0',
        accentSoft: '#e8eefc',
        onAccent: '#ffffff',
        bg: '#ffffff',
        surface: '#f6f8fb',
        text: '#1b2230',
        text2: '#5a6577',
        text3: '#8b94a3',
        line: '#e2e5ea',
        scrim: 'rgb(15 23 42 / 40%)',
      },
      dark: {
        accent: '#6d9bff',
        accentSoft: '#1b2740',
        onAccent: '#0d1017',
        bg: '#0d1017',
        surface: '#151a22',
        text: '#e8ecf4',
        text2: '#9aa7bd',
        text3: '#6c7889',
        line: '#222b3a',
        scrim: 'rgb(0 0 0 / 60%)',
      },
    },
    font: 'sans',
    headingWeight: 600,
    scale: 'normal',
    lineHeight: 'normal',
    density: 'normal',
    radius: 'md',
    contentWidth: 'prose',
    shadow: 'soft',
    motion: true,
  },
  paper: {
    id: 'paper',
    name: '纸感',
    summary: '米白底配衬线，适合读长文。',
    colors: {
      light: {
        accent: '#8a5a2b',
        accentSoft: '#efe4d2',
        onAccent: '#ffffff',
        bg: '#f8f4ea',
        surface: '#f1ebdd',
        text: '#2a2620',
        text2: '#5c564a',
        text3: '#857e6f',
        line: '#ded5c4',
        scrim: 'rgb(42 38 32 / 40%)',
      },
      dark: {
        accent: '#d6b07a',
        accentSoft: '#2f2820',
        onAccent: '#1b1915',
        bg: '#1b1915',
        surface: '#24201a',
        text: '#e9e3d6',
        text2: '#b3ab99',
        text3: '#8b8473',
        line: '#3a352b',
        scrim: 'rgb(0 0 0 / 55%)',
      },
    },
    font: 'serif',
    headingWeight: 600,
    scale: 'normal',
    lineHeight: 'loose',
    density: 'normal',
    radius: 'sm',
    contentWidth: 'narrow',
    shadow: 'none',
    motion: true,
  },
  magazine: {
    id: 'magazine',
    name: '杂志',
    summary: '宽留白、粗标题、大图优先。',
    colors: {
      light: {
        accent: '#e11d48',
        accentSoft: '#fde8ed',
        onAccent: '#ffffff',
        bg: '#ffffff',
        surface: '#f4f4f5',
        text: '#111114',
        text2: '#52525b',
        text3: '#86868f',
        line: '#e4e4e7',
        scrim: 'rgb(0 0 0 / 40%)',
      },
      dark: {
        accent: '#fb7185',
        accentSoft: '#2c1219',
        onAccent: '#0a0a0b',
        bg: '#0a0a0b',
        surface: '#17171a',
        text: '#f4f4f5',
        text2: '#a1a1aa',
        text3: '#71717a',
        line: '#27272a',
        scrim: 'rgb(0 0 0 / 60%)',
      },
    },
    font: 'sans',
    headingWeight: 800,
    scale: 'spacious',
    lineHeight: 'normal',
    density: 'normal',
    radius: 'sm',
    contentWidth: 'wide',
    shadow: 'soft',
    motion: true,
  },
  terminal: {
    id: 'terminal',
    name: '终端',
    summary: '近黑底、等宽字体、绿色强调。',
    colors: {
      light: {
        accent: '#0f7b3f',
        accentSoft: '#dcf2e4',
        onAccent: '#ffffff',
        bg: '#f6f8f6',
        surface: '#edf2ee',
        text: '#10251a',
        text2: '#3d5c4a',
        text3: '#6b8574',
        line: '#d3ded6',
        scrim: 'rgb(16 37 26 / 40%)',
      },
      dark: {
        accent: '#4ade80',
        accentSoft: '#10251a',
        onAccent: '#050706',
        bg: '#050706',
        surface: '#0c110e',
        text: '#d6e7da',
        text2: '#8fb39b',
        text3: '#60806b',
        line: '#1c2b21',
        scrim: 'rgb(0 0 0 / 65%)',
      },
    },
    font: 'mono',
    headingWeight: 700,
    scale: 'compact',
    lineHeight: 'tight',
    density: 'compact',
    radius: 'none',
    contentWidth: 'prose',
    shadow: 'none',
    motion: false,
  },
  warm: {
    id: 'warm',
    name: '暖阳',
    summary: '暖灰底配琥珀强调，柔和大圆角。',
    colors: {
      light: {
        accent: '#b45309',
        accentSoft: '#fbe8d3',
        onAccent: '#ffffff',
        bg: '#fbf7f2',
        surface: '#f4ede3',
        text: '#2b2520',
        text2: '#6b5f52',
        text3: '#948779',
        line: '#e6dccd',
        scrim: 'rgb(43 37 32 / 40%)',
      },
      dark: {
        accent: '#f59e0b',
        accentSoft: '#2e2113',
        onAccent: '#171310',
        bg: '#171310',
        surface: '#201a15',
        text: '#f0e7dc',
        text2: '#b6a795',
        text3: '#8a7c6b',
        line: '#332a21',
        scrim: 'rgb(0 0 0 / 60%)',
      },
    },
    font: 'sans',
    headingWeight: 700,
    scale: 'normal',
    lineHeight: 'normal',
    density: 'normal',
    radius: 'lg',
    contentWidth: 'prose',
    shadow: 'soft',
    motion: true,
  },
  minimal: {
    id: 'minimal',
    name: '极简',
    summary: '纯黑白灰、细线、无阴影。',
    colors: {
      light: {
        accent: '#111111',
        accentSoft: '#f0f0f0',
        onAccent: '#ffffff',
        bg: '#ffffff',
        surface: '#fafafa',
        text: '#111111',
        text2: '#555555',
        text3: '#8a8a8a',
        line: '#e8e8e8',
        scrim: 'rgb(0 0 0 / 35%)',
      },
      dark: {
        accent: '#ededed',
        accentSoft: '#1f1f1f',
        onAccent: '#0a0a0a',
        bg: '#0a0a0a',
        surface: '#141414',
        text: '#ededed',
        text2: '#a3a3a3',
        text3: '#737373',
        line: '#262626',
        scrim: 'rgb(0 0 0 / 60%)',
      },
    },
    font: 'sans',
    headingWeight: 600,
    scale: 'compact',
    lineHeight: 'normal',
    density: 'normal',
    radius: 'sm',
    contentWidth: 'prose',
    shadow: 'none',
    motion: false,
  },
};

export const COLOR_KEYS = [
  'accent',
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
