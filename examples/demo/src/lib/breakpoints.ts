/**
 * 可自定义断点（模板侧）。
 *
 * 规格：.agents/specs/breakpoints.md §1–§3。
 * - 配置写在 xiao.config.json 的 `theme.breakpoints`，省略时用 DEFAULT_BREAKPOINTS（md=1023、sm=767）。
 * - 生成 token 类：`x-<id>-pad-lg`、`x-<id>-cols-2`…（base 无前缀类仍在 xiao.css）。
 * - 级联：@media (max-width) 块按 maxWidth 降序输出（窄的在后，覆盖宽的）。
 * - 隐藏：`x-hide-desktop` 无上界；`x-hide-<id>` 只作用于该断点区间。
 * - 默认配置的生成结果与 1.x/现状的 md、sm、hide 规则等价，老内容与老站点不变。
 */

export interface Breakpoint {
  /** 类名前缀，`[a-z][a-z0-9-]{1,16}`，唯一；建成后不允许改名。 */
  id: string;
  /** 面板显示名（可改）。 */
  label: string;
  /** 该断点的上界（含），整数 320–3840。 */
  maxWidth: number;
}

export interface BreakpointTheme {
  breakpoints?: unknown;
}

export const BREAKPOINT_ID_RE = /^[a-z][a-z0-9-]{1,16}$/;
export const MIN_BREAKPOINTS = 1;
export const MAX_BREAKPOINTS = 6;
export const MIN_BREAKPOINT_WIDTH = 320;
export const MAX_BREAKPOINT_WIDTH = 3840;

/** 默认断点：与 1.x/现状一致（md=1023 平板、sm=767 手机）。 */
export const DEFAULT_BREAKPOINTS: readonly Breakpoint[] = [
  { id: 'md', label: '平板', maxWidth: 1023 },
  { id: 'sm', label: '手机', maxWidth: 767 },
];

/**
 * 生成器覆盖的 token 类（后缀 → 声明）。顺序与现状 xiao.css 的 md/sm 块一致，
 * 改动这里时同步改 xiao.css 的 base 类，保证「base → 断点覆盖」语义不变。
 */
const TOKEN_RULES: readonly (readonly [name: string, declaration: string])[] = [
  ['pad-none', 'padding:0'],
  ['gap-none', 'gap:0'],
  ['pad-xs', 'padding:var(--space-1)'],
  ['gap-xs', 'gap:var(--space-1)'],
  ['pad-sm', 'padding:var(--space-2)'],
  ['gap-sm', 'gap:var(--space-2)'],
  ['pad-md', 'padding:var(--space-4)'],
  ['gap-md', 'gap:var(--space-4)'],
  ['pad-lg', 'padding:clamp(var(--space-4), 3vw, var(--space-5))'],
  ['gap-lg', 'gap:clamp(var(--space-4), 3vw, var(--space-5))'],
  ['pad-xl', 'padding:clamp(var(--space-5), 4vw, var(--space-6))'],
  ['gap-xl', 'gap:clamp(var(--space-5), 4vw, var(--space-6))'],
  ['pad-2xl', 'padding:clamp(var(--space-6), 5vw, var(--space-8))'],
  ['gap-2xl', 'gap:clamp(var(--space-6), 5vw, var(--space-8))'],
  ['bg-default', 'background:var(--color-bg);color:var(--color-text)'],
  ['bg-primary', 'background:var(--color-accent);color:var(--color-on-accent)'],
  ['bg-surface', 'background:var(--color-surface)'],
  ['bg-muted', 'color:var(--color-text-2)'],
  ['bg-accent', 'background:var(--color-surface);border:1px solid var(--color-accent)'],
  ['bg-inverse', 'background:var(--color-text);color:var(--color-bg)'],
  ['width-narrow', 'max-width:var(--w-narrow);margin-inline:auto'],
  ['width-prose', 'max-width:var(--w-prose);margin-inline:auto'],
  ['width-wide', 'max-width:var(--w-wide);margin-inline:auto'],
  ['width-full', 'width:100%;max-width:none'],
  ['cols-1', 'grid-template-columns:minmax(0,1fr)'],
  ['cols-2', 'grid-template-columns:repeat(2,minmax(0,1fr))'],
  ['cols-3', 'grid-template-columns:repeat(3,minmax(0,1fr))'],
  ['cols-4', 'grid-template-columns:repeat(4,minmax(0,1fr))'],
  ['dir-column', 'flex-direction:column'],
  ['dir-row', 'flex-direction:row'],
  ['align-start', 'align-items:flex-start'],
  ['align-center', 'align-items:center'],
  ['align-end', 'align-items:flex-end'],
  ['justify-start', 'justify-content:flex-start'],
  ['justify-center', 'justify-content:center'],
  ['justify-end', 'justify-content:flex-end'],
  ['justify-between', 'justify-content:space-between'],
  ['radius-none', 'border-radius:0'],
  ['radius-sm', 'border-radius:var(--radius-sm)'],
  ['radius-md', 'border-radius:var(--radius-md)'],
  ['radius-lg', 'border-radius:var(--radius-lg)'],
  ['radius-full', 'border-radius:999px'],
  ['shadow-none', 'box-shadow:none'],
  ['shadow-sm', 'box-shadow:var(--shadow-1)'],
  ['shadow-md', 'box-shadow:var(--shadow-2)'],
  ['shadow-lg', 'box-shadow:0 16px 40px rgb(0 0 0 / 18%)'],
  ['border-none', 'border:0'],
  ['border-subtle', 'border:1px solid var(--color-line)'],
  ['border-strong', 'border:1px solid var(--color-text-2)'],
  ['text-xs', 'font-size:var(--font-size-xs)'],
  ['text-sm', 'font-size:var(--font-size-sm)'],
  ['text-base', 'font-size:var(--font-size-base)'],
  ['text-md', 'font-size:var(--font-size-md)'],
  ['text-lg', 'font-size:var(--font-size-lg)'],
  ['text-xl', 'font-size:var(--font-size-xl)'],
  ['text-2xl', 'font-size:var(--font-size-2xl)'],
  ['text-3xl', 'font-size:var(--font-size-3xl)'],
  ['weight-normal', 'font-weight:400'],
  ['weight-medium', 'font-weight:500'],
  ['weight-bold', 'font-weight:600'],
  ['color-default', 'color:var(--color-text)'],
  ['color-muted', 'color:var(--color-text-2)'],
  ['color-primary', 'color:var(--color-accent)'],
  ['talign-start', 'text-align:start'],
  ['talign-center', 'text-align:center'],
  ['talign-end', 'text-align:end'],
];

/** 1.x 时代留下的隐藏类：默认断点下仍然可用（老内容不变），声明与现状逐字一致。 */
const LEGACY_HIDE_BY_BREAKPOINT: Record<string, { name: string; declaration: string }> = {
  md: { name: 'tablet', declaration: 'display:none !important' },
  sm: { name: 'mobile', declaration: 'display:none' },
};

function copyBreakpoint(breakpoint: Breakpoint): Breakpoint {
  return { id: breakpoint.id, label: breakpoint.label, maxWidth: breakpoint.maxWidth };
}

function defaultBreakpoints(): Breakpoint[] {
  return DEFAULT_BREAKPOINTS.map(copyBreakpoint).sort((a, b) => a.maxWidth - b.maxWidth);
}

/** 校验一份 breakpoints 配置；任何一项非法都返回 null（由调用方回退默认值）。 */
function parseBreakpoints(value: unknown): Breakpoint[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < MIN_BREAKPOINTS || value.length > MAX_BREAKPOINTS) return null;
  const ids = new Set<string>();
  const widths = new Set<number>();
  const result: Breakpoint[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const maxWidth = record.maxWidth;
    if (!BREAKPOINT_ID_RE.test(id) || ids.has(id)) return null;
    if (
      typeof maxWidth !== 'number' ||
      !Number.isInteger(maxWidth) ||
      maxWidth < MIN_BREAKPOINT_WIDTH ||
      maxWidth > MAX_BREAKPOINT_WIDTH ||
      widths.has(maxWidth)
    ) {
      return null;
    }
    const label =
      typeof record.label === 'string' && record.label.trim() ? record.label.trim() : id;
    ids.add(id);
    widths.add(maxWidth);
    result.push({ id, label, maxWidth });
  }
  return result.sort((a, b) => a.maxWidth - b.maxWidth);
}

/**
 * 读取并校验 `theme.breakpoints`：非法（数量、id、宽度、重复）时整表回退默认值。
 * 返回值按 maxWidth **升序**（存储语义；生成 CSS 时会反转为「宽 → 窄」输出）。
 */
export function resolveBreakpoints(theme?: BreakpointTheme | null): Breakpoint[] {
  const parsed = parseBreakpoints(theme?.breakpoints);
  if (parsed) return parsed;
  return defaultBreakpoints();
}

function tokenRules(prefix: string): string {
  return TOKEN_RULES.map(([name, declaration]) => `  .${prefix}${name}{${declaration}}`).join('\n');
}

/** 单个断点的 token 块；md/sm 额外带上 1.x 的隐藏类别名。 */
function tokenBlock(breakpoint: Breakpoint): string {
  const parts: string[] = [];
  const legacy = LEGACY_HIDE_BY_BREAKPOINT[breakpoint.id];
  if (legacy) parts.push(`  .x-hide-${legacy.name}{${legacy.declaration}}`);
  parts.push(tokenRules(`x-${breakpoint.id}-`));
  return `@media (max-width: ${breakpoint.maxWidth}px) {\n${parts.join('\n')}\n}\n`;
}

/** 隐藏类：desktop 无上界，其余断点用精确区间。 */
function hideBlocks(ascending: Breakpoint[]): string {
  const widest = ascending[ascending.length - 1];
  if (!widest) return '';
  const blocks = [
    `@media (min-width: ${widest.maxWidth + 1}px) {\n  .x-hide-desktop{display:none !important}\n}\n`,
  ];
  for (let index = ascending.length - 1; index >= 0; index -= 1) {
    const breakpoint = ascending[index];
    if (!breakpoint) continue;
    const previous = index > 0 ? ascending[index - 1] : undefined;
    const media = previous
      ? `(min-width: ${previous.maxWidth + 1}px) and (max-width: ${breakpoint.maxWidth}px)`
      : `(max-width: ${breakpoint.maxWidth}px)`;
    blocks.push(`@media ${media} {\n  .x-hide-${breakpoint.id}{display:none !important}\n}\n`);
  }
  return blocks.join('');
}

/**
 * 生成断点 CSS（token 类 + hide 区间），由 BaseLayout 以 inline style 注入。
 * 传入空数组/非法表时回退默认断点。
 */
export function breakpointCss(breakpoints: readonly Breakpoint[] = DEFAULT_BREAKPOINTS): string {
  const resolved = parseBreakpoints(breakpoints.map(copyBreakpoint));
  const ascending = resolved ?? defaultBreakpoints();
  // 级联要求：maxWidth 降序输出（最宽的先写，最窄的后写，窄屏覆盖宽屏）。
  const descending = [...ascending].sort((a, b) => b.maxWidth - a.maxWidth);
  const header =
    '/* 断点样式由 src/lib/breakpoints.ts 按 xiao.config.json 的 theme.breakpoints 生成，勿手改。 */\n';
  return `${header}${hideBlocks(ascending)}${descending.map(tokenBlock).join('')}`;
}
