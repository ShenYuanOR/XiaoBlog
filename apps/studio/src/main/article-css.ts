/**
 * 给文章编辑器准备「站点自己的外观」。
 *
 * 编辑器把正文放进 Shadow DOM，这里把站点的 base/prose/xiao/custom.css 读出来、
 * 把 `:root` / `html` / `body` 换成 Shadow 里的表面元素，再按 xiao.config.json 的
 * theme 段补一份令牌。
 *
 * 已知边界：预设（theme.preset）的色板来自模板的 themes.ts，这里不复制那份数据；
 * 没有显式 theme.colors 的预设站点会落到 base.css 的 --hue 兜底色。非预设站点
 * （1.x 配置和默认配置）的观感与站点一致。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface ArticleCss {
  css: string;
  colorScheme: 'auto' | 'light' | 'dark';
  breakpoints: { id: string; label: string }[];
}

const FONT_STACKS: Record<string, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  serif: "'Palatino Linotype', 'Songti SC', 'Noto Serif SC', Georgia, serif",
  mono: "ui-monospace, 'Cascadia Code', 'SF Mono', 'JetBrains Mono', Consolas, monospace",
};

const CONTENT_WIDTHS: Record<string, string> = {
  narrow: '560px',
  prose: '720px',
  wide: '1200px',
  full: '1fr',
};

const RADII: Record<string, Record<string, string>> = {
  none: { base: '0px', xs: '0px', sm: '0px', md: '0px', lg: '0px', pill: '999px' },
  sm: { base: '6px', xs: '3px', sm: '4px', md: '5px', lg: '6px', pill: '999px' },
  md: { base: '12px', xs: '4px', sm: '6px', md: '8px', lg: '12px', pill: '999px' },
  lg: { base: '20px', xs: '6px', sm: '10px', md: '14px', lg: '20px', pill: '999px' },
  pill: { base: '999px', xs: '8px', sm: '12px', md: '16px', lg: '999px', pill: '999px' },
};

const SHADOWS: Record<string, { one: string; two: string }> = {
  none: { one: 'none', two: 'none' },
  soft: { one: '0 1px 2px rgb(0 0 0 / 6%)', two: '0 8px 24px rgb(0 0 0 / 8%)' },
  strong: { one: '0 2px 4px rgb(0 0 0 / 14%)', two: '0 16px 40px rgb(0 0 0 / 20%)' },
};

const LINE_HEIGHTS: Record<string, { body: number; heading: number }> = {
  tight: { body: 1.6, heading: 1.25 },
  normal: { body: 1.8, heading: 1.35 },
  loose: { body: 2, heading: 1.5 },
};

const BASE_FONT_SIZES: Record<string, number> = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 22,
  '3xl': 30,
  bodySm: 15,
};

const BASE_SPACES = [4, 8, 12, 16, 24, 32, 48, 64];

const SCALE_FACTORS: Record<string, number> = { compact: 0.9, normal: 1, spacious: 1.12 };
const DENSITY_FACTORS: Record<string, number> = { compact: 0.85, normal: 1 };

const COLOR_VARS: Record<string, string> = {
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

interface ThemeConfig {
  preset?: string;
  colorScheme?: string;
  hue?: number;
  colors?: { light?: Record<string, string>; dark?: Record<string, string> };
  font?: string;
  fontStack?: string;
  scale?: string;
  lineHeight?: string;
  density?: string;
  radius?: string;
  contentWidth?: string;
  shadow?: string;
  motion?: boolean;
  breakpoints?: { id?: string; label?: string; maxWidth?: number }[];
}

function pixel(value: number): string {
  return `${Math.round(value * 10) / 10}px`;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function declaration(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
}

function themeTokens(theme: ThemeConfig): {
  tokens: string;
  colorScheme: ArticleCss['colorScheme'];
} {
  const scale = SCALE_FACTORS[theme.scale ?? 'normal'] ?? 1;
  const density = DENSITY_FACTORS[theme.density ?? 'normal'] ?? 1;
  const space = scale * density;
  const fontSize = (value: number): string => pixel(value * scale);
  const radius = RADII[theme.radius ?? 'md'] ?? RADII.md ?? {};
  const shadow = SHADOWS[theme.shadow ?? 'none'] ?? SHADOWS.none ?? { one: 'none', two: 'none' };
  const lineHeight = LINE_HEIGHTS[theme.lineHeight ?? 'normal'] ??
    LINE_HEIGHTS.normal ?? {
      body: 1.8,
      heading: 1.35,
    };
  const contentWidth = CONTENT_WIDTHS[theme.contentWidth ?? 'prose'] ?? '720px';
  const stack = theme.fontStack?.trim()
    ? theme.fontStack.trim()
    : FONT_STACKS[theme.font === 'serif' ? 'serif' : theme.font === 'mono' ? 'mono' : 'sans'];

  const vars: Record<string, string> = {
    '--hue': String(typeof theme.hue === 'number' ? theme.hue : 250),
    '--w-content': contentWidth,
    '--content': contentWidth,
    '--radius': radius.base ?? '12px',
    '--radius-xs': radius.xs ?? '4px',
    '--radius-sm': radius.sm ?? '6px',
    '--radius-md': radius.md ?? '8px',
    '--radius-lg': radius.lg ?? '12px',
    '--radius-pill': radius.pill ?? '999px',
    '--font-body': stack,
    '--font-heading': theme.font === 'mono' ? FONT_STACKS.mono : stack,
    '--font-mono': FONT_STACKS.mono,
    '--weight-heading': '600',
    '--font-size-xs': fontSize(BASE_FONT_SIZES.xs ?? 12),
    '--font-size-sm': fontSize(BASE_FONT_SIZES.sm ?? 13),
    '--font-size-base': fontSize(BASE_FONT_SIZES.base ?? 14),
    '--font-size-md': fontSize(BASE_FONT_SIZES.md ?? 16),
    '--font-size-lg': fontSize(BASE_FONT_SIZES.lg ?? 18),
    '--font-size-xl': fontSize(BASE_FONT_SIZES.xl ?? 20),
    '--font-size-2xl': fontSize(BASE_FONT_SIZES['2xl'] ?? 22),
    '--font-size-3xl': fontSize(BASE_FONT_SIZES['3xl'] ?? 30),
    '--font-size-3xl-mobile': fontSize(BASE_FONT_SIZES['3xl'] ?? 30),
    '--font-size-body': fontSize(BASE_FONT_SIZES.md ?? 16),
    '--font-size-body-sm': fontSize(BASE_FONT_SIZES.bodySm ?? 15),
    '--lh-body': String(lineHeight.body),
    '--lh-heading': String(lineHeight.heading),
    '--shadow-1': shadow.one,
    '--shadow-2': shadow.two,
    '--dur': theme.motion === false ? '0ms' : '150ms',
    '--dur-2': theme.motion === false ? '0ms' : '200ms',
  };
  BASE_SPACES.forEach((value, index) => {
    vars[`--space-${index + 1}`] = pixel(value * space);
  });

  const light = { ...vars, ...paletteVars(theme.colors?.light) };
  const darkPalette = paletteVars(theme.colors?.dark);
  const blocks = [`.xiao-surface{${declaration(light)}}`];
  if (Object.keys(darkPalette).length) {
    blocks.push(`.xiao-surface[data-theme='dark']{${declaration(darkPalette)}}`);
    blocks.push(
      `@media (prefers-color-scheme: dark){.xiao-surface[data-theme='auto']{${declaration(darkPalette)}}}`,
    );
  }
  const scheme = theme.colorScheme;
  return {
    tokens: blocks.join('\n'),
    colorScheme: scheme === 'light' || scheme === 'dark' ? scheme : 'auto',
  };
}

function paletteVars(palette: Record<string, string> | undefined): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!palette) return vars;
  for (const [key, name] of Object.entries(COLOR_VARS)) {
    const value = palette[key];
    if (typeof value === 'string' && value.trim()) vars[name] = value.trim();
  }
  return vars;
}

/** Shadow DOM 里没有 document root，`:root` / `body` / `html` 都不匹配，换成表面元素。 */
function scopeCss(css: string): string {
  return css
    .replace(/:root(?=[\s,{:.#[])/g, '.xiao-surface')
    .replace(/(^|[\s,{>])html(?=[\s,{:.#[])/gm, '$1.xiao-surface')
    .replace(/(^|[\s,{>])body(?=[\s,{:.#[])/gm, '$1.xiao-surface');
}

const EDITOR_CSS = `
.xiao-surface {
  min-height: 100%;
  background: var(--color-bg);
  color: var(--color-text);
}
.xiao-surface .article-editor__article {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--w-content, 720px);
  min-height: 100%;
  margin: 0 auto;
  padding: 56px 32px 180px;
}
.xiao-surface .ProseMirror {
  outline: none;
  min-height: calc(100vh - 240px);
  caret-color: var(--color-accent);
}
.xiao-surface .ProseMirror > :first-child {
  margin-top: 0;
}
.xiao-surface .ProseMirror p.xiao-empty-block::before {
  content: '输入内容，或按 / 选择区块';
  float: left;
  height: 0;
  color: var(--color-text-3);
  pointer-events: none;
}
.xiao-surface .ProseMirror .xiao-empty-heading::before {
  content: '标题 ' attr(data-level);
  color: var(--color-text-3);
  opacity: 0.55;
  pointer-events: none;
}
.xiao-surface .ProseMirror-selectednode {
  outline: 2px solid #6d9bff;
  outline-offset: 2px;
}
.xiao-surface .ProseMirror [data-xiao-drop='before'] {
  box-shadow: 0 -3px 0 #6d9bff;
}
.xiao-surface .ProseMirror [data-xiao-drop='after'] {
  box-shadow: 0 3px 0 #6d9bff;
}
.xiao-surface .xiao-html-block {
  position: relative;
  margin: 1em 0;
  padding: 16px;
  border: 1px dashed color-mix(in oklab, var(--color-text-3) 45%, transparent);
  border-radius: 8px;
}
.xiao-surface .xiao-html-block::before {
  content: '原始 HTML';
  position: absolute;
  top: -9px;
  left: 10px;
  padding: 0 6px;
  background: var(--color-bg);
  color: var(--color-text-3);
  font: 11px/1.6 var(--font-body);
  letter-spacing: 0.04em;
}
.xiao-surface .xiao-html-block__inner {
  pointer-events: none;
}
.xiao-surface .ProseMirror img {
  max-width: 100%;
  height: auto;
}
.xiao-surface .ProseMirror figure.is-empty {
  display: grid;
  place-items: center;
  min-height: 120px;
  border: 1px dashed var(--color-line);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-3);
}
.xiao-surface .ProseMirror figure.is-empty img {
  display: none;
}
.xiao-surface .ProseMirror figure.is-empty::before {
  content: '选择图片';
  font-size: var(--font-size-sm);
}
.xiao-surface .ProseMirror > a.x-button {
  margin: 0.6em 0;
}
.xiao-surface .ProseMirror [data-xiao='columns'] {
  margin: 1em 0;
}
.xiao-surface .ProseMirror figure {
  margin: 1.4em 0;
}
.xiao-surface .ProseMirror figcaption {
  margin-top: 0.5em;
  color: var(--color-text-3);
  font-size: var(--font-size-sm);
  text-align: center;
}
`;

interface ResolvedBreakpoint {
  id: string;
  label: string;
  maxWidth: number;
}

const DEFAULT_BREAKPOINTS: ResolvedBreakpoint[] = [
  { id: 'md', label: '平板', maxWidth: 1023 },
  { id: 'sm', label: '手机', maxWidth: 767 },
];

function resolveBreakpoints(theme: ThemeConfig): ResolvedBreakpoint[] {
  const rows = (theme.breakpoints ?? [])
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id.trim() : '',
      label: typeof item.label === 'string' ? item.label.trim() : '',
      maxWidth: typeof item.maxWidth === 'number' ? Math.round(item.maxWidth) : 0,
    }))
    .filter(
      (item) =>
        /^[a-z][a-z0-9-]{1,16}$/.test(item.id) && item.maxWidth >= 320 && item.maxWidth <= 3840,
    );
  if (!rows.length) return [...DEFAULT_BREAKPOINTS].sort((a, b) => a.maxWidth - b.maxWidth);
  const unique = new Map<string, ResolvedBreakpoint>();
  for (const row of rows) {
    unique.set(row.id, { ...row, label: row.label || row.id });
  }
  return [...unique.values()].sort((a, b) => a.maxWidth - b.maxWidth);
}

/** 与模板 lib/breakpoints.ts 的 hideBlocks 一致；Shadow 里也要能看到隐藏效果。 */
function hideCss(breakpoints: ResolvedBreakpoint[]): string {
  if (!breakpoints.length) return '';
  const widest = breakpoints[breakpoints.length - 1];
  if (!widest) return '';
  const blocks = [
    `@media (min-width: ${widest.maxWidth + 1}px){.xiao-surface .x-hide-desktop{display:none !important}}`,
  ];
  for (let index = breakpoints.length - 1; index >= 0; index -= 1) {
    const item = breakpoints[index];
    if (!item) continue;
    const previous = index > 0 ? breakpoints[index - 1] : undefined;
    const media = previous
      ? `(min-width: ${previous.maxWidth + 1}px) and (max-width: ${item.maxWidth}px)`
      : `(max-width: ${item.maxWidth}px)`;
    blocks.push(`@media ${media}{.xiao-surface .x-hide-${item.id}{display:none !important}}`);
  }
  return blocks.join('\n');
}

export function readArticleCss(siteDir: string): ArticleCss {
  const root = path.resolve(siteDir);
  const files = ['base.css', 'prose.css', 'xiao.css'];
  const parts = files
    .map((name) => path.join(root, 'src', 'styles', name))
    .filter((file) => existsSync(file))
    .map((file) => scopeCss(readFileSync(file, 'utf8')));
  const config = readJson(path.join(root, 'xiao.config.json'));
  const theme = (config?.theme ?? {}) as ThemeConfig;
  const { tokens, colorScheme } = themeTokens(theme);
  parts.push(tokens);
  const custom = path.join(root, 'src', 'styles', 'custom.css');
  if (existsSync(custom)) parts.push(scopeCss(readFileSync(custom, 'utf8')));
  const breakpoints = resolveBreakpoints(theme);
  parts.push(EDITOR_CSS);
  parts.push(hideCss(breakpoints));
  return {
    css: parts.join('\n'),
    colorScheme,
    breakpoints: breakpoints.map((item) => ({ id: item.id, label: item.label })),
  };
}
