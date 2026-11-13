import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Breakpoint } from './breakpoints';
import {
  BASE_FONT_SIZES,
  BASE_SPACES,
  COLOR_KEYS,
  COLOR_VARS,
  CONTENT_WIDTHS,
  DENSITY_FACTOR,
  DURATIONS,
  FONT_STACKS,
  LINE_HEIGHTS,
  PRESETS,
  PRESET_IDS,
  RADII,
  SCALE_FACTOR,
  SHADOWS,
  type ColorSchemeId,
  type ContentWidthId,
  type DensityId,
  type LegacyFontId,
  type LineHeightId,
  type Palette,
  type PresetId,
  type RadiusId,
  type ScaleId,
  type ShadowId,
} from './themes';

/** theme.colors 里可以按亮/暗覆盖的字段；缺哪项就取预设（旧配置则继续由 --hue 派生）。 */
export interface ThemeColors {
  light?: Partial<Palette>;
  dark?: Partial<Palette>;
}

/**
 * xiao.config.json 的 theme 段。
 * 只增字段不删旧字段：1.x 的 hue/font/contentWidth/radius/colorScheme 全部保留且仍然生效。
 */
export interface ThemeConfig {
  preset?: PresetId;
  colorScheme?: ColorSchemeId;
  hue?: number;
  colors?: ThemeColors;
  font?: LegacyFontId;
  fontStack?: string;
  scale?: ScaleId;
  lineHeight?: LineHeightId;
  density?: DensityId;
  radius?: RadiusId;
  contentWidth?: ContentWidthId;
  shadow?: ShadowId;
  motion?: boolean;
  /** 响应式断点；省略时用 lib/breakpoints.ts 的 DEFAULT_BREAKPOINTS。 */
  breakpoints?: Breakpoint[];
}

export interface XiaoConfig {
  version: number;
  site: {
    url: string;
    base: string;
    lang: string;
    title: string;
    subtitle: string;
    description: string;
    favicon: string;
    ogImage: string;
    /** 首页横幅。留空则不显示，不用占位图。 */
    heroImage?: string;
    since: number;
  };
  author: { name: string; avatar: string; bio: string; email: string };
  social: { name: string; icon: string; url: string }[];
  nav: { label: string; href: string }[];
  theme: ThemeConfig;
  seo: { titleTemplate: string; twitter: string; noindex: boolean };
  posts: { pageSize: number; license: { enabled: boolean; name: string; url: string } };
  redirects: Record<string, string>;
}

/**
 * 最终算好的主题令牌。
 * colors 的语义：有 preset 时是合并覆盖后的完整两套色板；没有 preset 时只放用户显式覆盖项
 * （空对象＝保持 1.x 的 --hue 派生色，保证旧站点颜色不变）。
 */
export interface ResolvedTheme {
  preset: PresetId | null;
  colorScheme: ColorSchemeId;
  hue: number;
  font: LegacyFontId;
  headingWeight: number;
  scale: ScaleId;
  lineHeight: LineHeightId;
  density: DensityId;
  radius: RadiusId;
  contentWidth: ContentWidthId;
  shadow: ShadowId;
  motion: boolean;
  colors: { light: Partial<Palette>; dark: Partial<Palette> };
  /** 非颜色令牌，直接写进 :root 的自定义属性。 */
  tokens: Record<string, string>;
}

/** 2.0 默认预设。旧配置没写 preset 时不会套用它（否则颜色会突变）。 */
export const DEFAULT_PRESET: PresetId = 'midnight';

/** 每次渲染读磁盘。astro dev 下一次请求就能看到刚保存的配置，不用整站重建。 */
export function loadConfig(): XiaoConfig {
  const file = fileURLToPath(new URL('../../xiao.config.json', import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as XiaoConfig;
}

const FONT_IDS = ['sans', 'serif', 'mono', 'custom', 'mono-heading'] as const;
const COLOR_SCHEMES = ['auto', 'light', 'dark'] as const;
const SCALES = ['compact', 'normal', 'spacious'] as const;
const LINE_HEIGHT_IDS = ['tight', 'normal', 'loose'] as const;
const DENSITIES = ['compact', 'normal'] as const;
const RADIUS_IDS = ['none', 'sm', 'md', 'lg', 'pill'] as const;
const CONTENT_WIDTH_IDS = ['narrow', 'prose', 'wide', 'full'] as const;
const SHADOW_IDS = ['none', 'soft', 'strong'] as const;

const COLOR_VALUE_RE = /^[#a-zA-Z0-9%(),./\s-]+$/;

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickPreset(value: unknown): PresetId | null {
  return PRESET_IDS.includes(value as PresetId) ? (value as PresetId) : null;
}

function resolveHue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 360
    ? value
    : 250;
}

/** 只接受不会破坏 CSS 的简写值（十六进制 / rgb(a) / oklch / color-mix / var()）。 */
function colorValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > 120 || !COLOR_VALUE_RE.test(text)) return undefined;
  return text;
}

function resolvePalette(input: unknown): Partial<Palette> {
  const out: Partial<Palette> = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of COLOR_KEYS) {
    const value = colorValue((input as Record<string, unknown>)[key]);
    if (value) out[key] = value;
  }
  return out;
}

function pixel(value: number): string {
  return `${Math.round(value * 10) / 10}px`;
}

function paletteVars(palette: Partial<Palette>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of COLOR_KEYS) {
    const value = palette[key];
    if (value) vars[COLOR_VARS[key]] = value;
  }
  return vars;
}

function declaration(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
}

/**
 * 把 xiao.config.json 的 theme 段解析成最终令牌。
 *
 * 合并规则（与 spec 一致）：预设只作为默认来源，显式字段优先；
 * 没有 preset 时按 1.x 行为走 --hue 派生色板，并把旧字段映射到新令牌。
 */
export function resolveTheme(config: XiaoConfig = loadConfig()): ResolvedTheme {
  const theme: ThemeConfig = config?.theme ?? {};
  const presetId = pickPreset(theme.preset);
  const preset = presetId ? PRESETS[presetId] : null;

  const colorScheme = pickEnum(theme.colorScheme, COLOR_SCHEMES, 'auto');
  const font = pickEnum(theme.font, FONT_IDS, preset?.font ?? 'sans');
  const scaleId = pickEnum(theme.scale, SCALES, preset?.scale ?? 'normal');
  const lineHeightId = pickEnum(theme.lineHeight, LINE_HEIGHT_IDS, preset?.lineHeight ?? 'normal');
  const densityId = pickEnum(theme.density, DENSITIES, preset?.density ?? 'normal');
  const radiusId = pickEnum(theme.radius, RADIUS_IDS, preset?.radius ?? 'md');
  const contentWidth = pickEnum(
    theme.contentWidth,
    CONTENT_WIDTH_IDS,
    preset?.contentWidth ?? 'prose',
  );
  const shadowId = pickEnum(theme.shadow, SHADOW_IDS, preset?.shadow ?? 'none');
  const motion = typeof theme.motion === 'boolean' ? theme.motion : (preset?.motion ?? true);
  const hue = resolveHue(theme.hue);
  const headingWeight = preset?.headingWeight ?? 600;

  const overrides = {
    light: resolvePalette(theme.colors?.light),
    dark: resolvePalette(theme.colors?.dark),
  };
  const colors = preset
    ? {
        light: { ...preset.colors.light, ...overrides.light },
        dark: { ...preset.colors.dark, ...overrides.dark },
      }
    : overrides;

  const customStack = typeof theme.fontStack === 'string' ? theme.fontStack.trim() : '';
  const stackOf = (id: LegacyFontId): string => {
    if (customStack) return customStack;
    const stack = FONT_STACKS[id === 'mono-heading' ? 'sans' : id];
    return stack || FONT_STACKS.sans;
  };
  const fontBody = stackOf(font);
  const fontHeading = font === 'mono' || font === 'mono-heading' ? FONT_STACKS.mono : fontBody;

  const scaleFactor = SCALE_FACTOR[scaleId];
  const spaceFactor = scaleFactor * DENSITY_FACTOR[densityId];
  const radius = RADII[radiusId];
  const shadow = SHADOWS[shadowId];
  const lineHeight = LINE_HEIGHTS[lineHeightId];
  const fontSize = (value: number): string => pixel(value * scaleFactor);

  const tokens: Record<string, string> = {
    '--hue': String(hue),
    '--w-content': CONTENT_WIDTHS[contentWidth],
    '--content': CONTENT_WIDTHS[contentWidth],
    '--radius': radius.base,
    '--radius-xs': radius.xs,
    '--radius-sm': radius.sm,
    '--radius-md': radius.md,
    '--radius-lg': radius.lg,
    '--radius-pill': radius.pill,
    '--font-body': fontBody,
    '--font-heading': fontHeading,
    '--font-mono': FONT_STACKS.mono,
    '--weight-heading': String(headingWeight),
    '--font-size-xs': fontSize(BASE_FONT_SIZES.xs),
    '--font-size-sm': fontSize(BASE_FONT_SIZES.sm),
    '--font-size-base': fontSize(BASE_FONT_SIZES.base),
    '--font-size-md': fontSize(BASE_FONT_SIZES.md),
    '--font-size-lg': fontSize(BASE_FONT_SIZES.lg),
    '--font-size-xl': fontSize(BASE_FONT_SIZES.xl),
    '--font-size-2xl': fontSize(BASE_FONT_SIZES['2xl']),
    '--font-size-3xl': fontSize(BASE_FONT_SIZES['3xl']),
    '--font-size-3xl-mobile': fontSize(BASE_FONT_SIZES['3xlMobile']),
    '--font-size-body': fontSize(BASE_FONT_SIZES.md),
    '--font-size-body-sm': fontSize(BASE_FONT_SIZES.bodySm),
    '--lh-body': String(lineHeight.body),
    '--lh-heading': String(lineHeight.heading),
    '--shadow-1': shadow.one,
    '--shadow-2': shadow.two,
    '--dur': motion ? DURATIONS.normal : '0ms',
    '--dur-2': motion ? DURATIONS.slow : '0ms',
  };
  BASE_SPACES.forEach((value, index) => {
    tokens[`--space-${index + 1}`] = pixel(value * spaceFactor);
  });

  return {
    preset: presetId,
    colorScheme,
    hue,
    font,
    headingWeight,
    scale: scaleId,
    lineHeight: lineHeightId,
    density: densityId,
    radius: radiusId,
    contentWidth,
    shadow: shadowId,
    motion,
    colors,
    tokens,
  };
}

/**
 * 生成注入 <head> 的 :root 令牌样式。
 *
 * 注入样式刻意不带 @layer：base.css 的令牌兜底在 @layer xiao-tokens 里，unlayered 永远赢，
 * 所以不依赖打包顺序；同时 custom.css（unlayered、排在注入之后）仍可覆盖令牌，保持 1.x 习惯。
 */
export function themeCss(theme: ResolvedTheme): string {
  const lightVars = { ...theme.tokens, ...paletteVars(theme.colors.light) };
  const blocks = [`:root{${declaration(lightVars)}}`];
  const darkVars = declaration(paletteVars(theme.colors.dark));
  if (darkVars) {
    blocks.push(`:root[data-theme='dark']{${darkVars}}`);
    blocks.push(`@media (prefers-color-scheme: dark){:root[data-theme='auto']{${darkVars}}}`);
  }
  return blocks.join('');
}

export function titleOf(pageTitle: string | undefined, config = loadConfig()): string {
  if (!pageTitle || pageTitle === config.site.title) return config.site.title;
  return config.seo.titleTemplate.replace('%s', pageTitle);
}
