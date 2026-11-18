import { readFileSync } from 'node:fs';
import path from 'node:path';
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
  RADII,
  SCALE_FACTOR,
  SHADOWS,
  type ColorSchemeId,
  type ContentWidthId,
  type DensityId,
  type LegacyFontId,
  type LineHeightId,
  type OptionValue,
  type Palette,
  type RadiusId,
  type ScaleId,
  type ShadowId,
  type ThemeManifest,
  type ThemeOptionDef,
} from './themes';

/** theme.colors 里可以按亮/暗覆盖的字段；缺哪项就取配色（没选配色则由 --hue 派生）。 */
export interface ThemeColors {
  light?: Partial<Palette>;
  dark?: Partial<Palette>;
}

/**
 * xiao.config.json 的 theme 段（D-99）：主题 / 主题配色 / 主题自定义项三层分开。
 * 旧键（preset / colorScheme / font / scale …）仍然可读，Studio 保存时迁移到新键。
 */
export interface ThemeConfig {
  /** 主题：站点用的是哪一套版式，对应 src/theme.json 的 id。 */
  id?: string;
  /** 主题配色：src/theme.json 里 palettes 的某一项；省略且没有旧 preset 时按 hue 派生。 */
  palette?: string;
  /** 亮暗模式。 */
  mode?: ColorSchemeId;
  hue?: number;
  colors?: ThemeColors;
  /** 主题自定义项，键与取值见 src/theme.json 的 options。 */
  options?: Record<string, OptionValue>;
  /** 响应式断点；省略时用 lib/breakpoints.ts 的 DEFAULT_BREAKPOINTS。 */
  breakpoints?: Breakpoint[];
  /** 以下为旧键，只读兼容。 */
  preset?: string;
  colorScheme?: ColorSchemeId;
  [legacy: string]: unknown;
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
    /** 横幅题图。留空则显示主题自带的插画。 */
    heroImage?: string;
    /** 旧键：公告已移到主题自定义项 announcement，这里只读兼容。 */
    announcement?: string;
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

/** 解析后的默认主题自定义项。 */
export interface ThemeOptions {
  font: LegacyFontId;
  fontStack: string;
  scale: ScaleId;
  lineHeight: LineHeightId;
  density: DensityId;
  contentWidth: ContentWidthId;
  radius: RadiusId;
  shadow: ShadowId;
  motion: boolean;
  heroArt: boolean;
  heroBits: boolean;
  featuredFirst: boolean;
  announcement: string;
  widgets: string[];
}

/**
 * 最终算好的主题令牌。
 * colors 的语义：选了配色时是合并覆盖后的完整两套色板；没选时只放用户显式覆盖项
 * （空对象＝保持 1.x 的 --hue 派生色，保证旧站点颜色不变）。
 */
export interface ResolvedTheme {
  id: string;
  palette: string | null;
  mode: ColorSchemeId;
  hue: number;
  options: ThemeOptions;
  colors: { light: Partial<Palette>; dark: Partial<Palette> };
  /** 非颜色令牌，直接写进 :root 的自定义属性。 */
  tokens: Record<string, string>;
}

/**
 * 按站点根目录定位文件。astro dev / astro build 都在站点根目录下运行；不能用 import.meta.url，
 * 构建时这段代码被打进 dist/.prerender/chunks，相对路径会指到 dist 里去。
 */
function siteFile(...parts: string[]): string {
  return path.resolve(process.cwd(), ...parts);
}

/** 每次渲染读磁盘。astro dev 下一次请求就能看到刚保存的配置，不用整站重建。 */
export function loadConfig(): XiaoConfig {
  return JSON.parse(readFileSync(siteFile('xiao.config.json'), 'utf8')) as XiaoConfig;
}

/** 主题声明文件；同样每次读盘，改了配色或自定义项声明不用重启。 */
export function loadManifest(): ThemeManifest {
  return JSON.parse(readFileSync(siteFile('src', 'theme.json'), 'utf8')) as ThemeManifest;
}

const COLOR_SCHEMES = ['auto', 'light', 'dark'] as const;
/** 从配色里拆出来、旧配置写在 theme 顶层的排版键。 */
const LEGACY_OPTION_KEYS = [
  'font',
  'fontStack',
  'scale',
  'lineHeight',
  'density',
  'contentWidth',
  'radius',
  'shadow',
  'motion',
] as const;

const COLOR_VALUE_RE = /^[#a-zA-Z0-9%(),./\s-]+$/;

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
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

/** 按声明校验一个自定义项的值，不合法就回默认值。 */
function optionValue(def: ThemeOptionDef, value: unknown): OptionValue {
  const allowed = def.choices?.map((choice) => choice.value);
  switch (def.type) {
    case 'switch':
      return typeof value === 'boolean' ? value : def.default;
    case 'checks':
      return Array.isArray(value)
        ? value.filter(
            (item): item is string =>
              typeof item === 'string' && (!allowed || allowed.includes(item)),
          )
        : def.default;
    case 'select':
    case 'segmented':
      return typeof value === 'string' && (!allowed || allowed.includes(value))
        ? value
        : def.default;
    default:
      return typeof value === 'string' ? value : def.default;
  }
}

/** 主题自定义项：声明默认值 ← 旧顶层键 ← theme.options。 */
export function resolveOptions(
  config: XiaoConfig = loadConfig(),
  manifest: ThemeManifest = loadManifest(),
): ThemeOptions {
  const theme: ThemeConfig = config?.theme ?? {};
  const legacy: Record<string, unknown> = {};
  for (const key of LEGACY_OPTION_KEYS) if (theme[key] !== undefined) legacy[key] = theme[key];
  if (config?.site?.announcement) legacy.announcement = config.site.announcement;
  const input: Record<string, unknown> = { ...legacy, ...(theme.options ?? {}) };
  const out: Record<string, OptionValue> = {};
  for (const def of manifest.options) out[def.key] = optionValue(def, input[def.key]);
  if (input.font === 'mono-heading') out.font = 'mono-heading';
  return out as unknown as ThemeOptions;
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
 * 主题配色只决定颜色；字体、字号等来自主题自定义项。没有选配色（也没有旧 preset）时
 * 按 1.x 行为走 --hue 派生色板。
 */
export function resolveTheme(config: XiaoConfig = loadConfig()): ResolvedTheme {
  const manifest = loadManifest();
  const theme: ThemeConfig = config?.theme ?? {};
  const paletteId = typeof theme.palette === 'string' ? theme.palette : theme.preset;
  const palette = manifest.palettes.items.find((item) => item.id === paletteId) ?? null;
  const mode = pickEnum(theme.mode ?? theme.colorScheme, COLOR_SCHEMES, 'auto');
  const hue = resolveHue(theme.hue);
  const options = resolveOptions(config, manifest);

  const overrides = {
    light: resolvePalette(theme.colors?.light),
    dark: resolvePalette(theme.colors?.dark),
  };
  const colors = palette
    ? {
        light: { ...palette.light, ...overrides.light },
        dark: { ...palette.dark, ...overrides.dark },
      }
    : overrides;

  const customStack = options.fontStack.trim();
  const stackOf = (id: LegacyFontId): string => {
    if (customStack) return customStack;
    const stack = FONT_STACKS[id === 'mono-heading' ? 'sans' : id];
    return stack || FONT_STACKS.sans;
  };
  const fontBody = stackOf(options.font);
  const fontHeading =
    options.font === 'mono' || options.font === 'mono-heading' ? FONT_STACKS.mono : fontBody;

  const scaleFactor = SCALE_FACTOR[options.scale];
  const spaceFactor = scaleFactor * DENSITY_FACTOR[options.density];
  const radius = RADII[options.radius];
  const shadow = SHADOWS[options.shadow];
  const lineHeight = LINE_HEIGHTS[options.lineHeight];
  const fontSize = (value: number): string => pixel(value * scaleFactor);

  const tokens: Record<string, string> = {
    '--hue': String(hue),
    '--w-content': CONTENT_WIDTHS[options.contentWidth],
    '--content': CONTENT_WIDTHS[options.contentWidth],
    '--radius': radius.base,
    '--radius-xs': radius.xs,
    '--radius-sm': radius.sm,
    '--radius-md': radius.md,
    '--radius-lg': radius.lg,
    '--radius-pill': radius.pill,
    '--font-body': fontBody,
    '--font-heading': fontHeading,
    '--font-mono': FONT_STACKS.mono,
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
    '--dur': options.motion ? DURATIONS.normal : '0ms',
    '--dur-2': options.motion ? DURATIONS.slow : '0ms',
  };
  BASE_SPACES.forEach((value, index) => {
    tokens[`--space-${index + 1}`] = pixel(value * spaceFactor);
  });

  return {
    id: manifest.id,
    palette: palette?.id ?? null,
    mode,
    hue,
    options,
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
