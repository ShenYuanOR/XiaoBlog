<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
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
} from '../ui/index.ts';

/**
 * 外观页：预设主题 + 令牌面板 + 本地实时预览。
 *
 * 说明：预设与令牌的取值表是 packages/template/src/lib/themes.ts 的镜像（Studio 渲染层不能直接
 * 引模板源码，也不能为此加 IPC），两边必须同步：改动模板预设时同步本文件的 PRESETS、advancedFields 与尺度表。
 */

type PresetId = 'midnight' | 'paper' | 'magazine' | 'terminal' | 'warm' | 'minimal';
type AdvancedField =
  | 'scale'
  | 'lineHeight'
  | 'density'
  | 'radius'
  | 'contentWidth'
  | 'shadow'
  | 'motion'
  | 'breakpoints';
type Scheme = 'auto' | 'light' | 'dark';
type SchemeName = 'light' | 'dark';
type LegacyFontId = 'sans' | 'serif' | 'mono' | 'mono-heading' | 'custom';
type ScaleId = 'compact' | 'normal' | 'spacious';
type LineHeightId = 'tight' | 'normal' | 'loose';
type DensityId = 'compact' | 'normal';
type RadiusId = 'none' | 'sm' | 'md' | 'lg' | 'pill';
type ContentWidthId = 'narrow' | 'prose' | 'wide' | 'full';
type ShadowId = 'none' | 'soft' | 'strong';

interface Palette {
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

interface PresetDef {
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
  advancedFields: AdvancedField[];
}

interface ThemeDraft {
  preset: PresetId | null;
  colorScheme: Scheme;
  hue: number;
  colors: { light: Partial<Palette>; dark: Partial<Palette> };
  font: LegacyFontId;
  fontStack: string;
  scale: ScaleId;
  lineHeight: LineHeightId;
  density: DensityId;
  radius: RadiusId;
  contentWidth: ContentWidthId;
  shadow: ShadowId;
  motion: boolean;
  breakpoints: BreakpointDraft[];
}

/** 断点：桌面（base）下按最大宽度生效，id 会进类名（x-<id>-pad-lg），建立后不建议改名。 */
interface BreakpointDraft {
  id: string;
  label: string;
  maxWidth: number;
}

const DEFAULT_BREAKPOINTS: BreakpointDraft[] = [
  { id: 'md', label: '平板', maxWidth: 1023 },
  { id: 'sm', label: '手机', maxWidth: 767 },
];
const BP_ID = /^[a-z][a-z0-9-]{1,16}$/;
const MAX_BREAKPOINTS = 6;

const FONT_STACKS: Record<Exclude<LegacyFontId, 'mono-heading'>, string> = {
  sans: "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  serif: "'Palatino Linotype', 'Songti SC', 'Noto Serif SC', Georgia, serif",
  mono: "ui-monospace, 'Cascadia Code', 'SF Mono', 'JetBrains Mono', Consolas, monospace",
  custom: '',
};

const SCALE_FACTOR: Record<ScaleId, number> = { compact: 0.9, normal: 1, spacious: 1.12 };
const DENSITY_FACTOR: Record<DensityId, number> = { compact: 0.85, normal: 1 };

const BASE_FONT_SIZES = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 22,
  '3xl': 30,
  '3xlMobile': 26,
  bodySm: 15,
} as const;

const BASE_SPACES = [4, 8, 12, 16, 24, 32, 48, 64] as const;

const LINE_HEIGHTS: Record<LineHeightId, { body: number; heading: number }> = {
  tight: { body: 1.6, heading: 1.25 },
  normal: { body: 1.8, heading: 1.35 },
  loose: { body: 2, heading: 1.5 },
};

const RADII: Record<
  RadiusId,
  { base: string; xs: string; sm: string; md: string; lg: string; pill: string }
> = {
  none: { base: '0px', xs: '0px', sm: '0px', md: '0px', lg: '0px', pill: '999px' },
  sm: { base: '6px', xs: '3px', sm: '4px', md: '5px', lg: '6px', pill: '999px' },
  md: { base: '12px', xs: '4px', sm: '6px', md: '8px', lg: '12px', pill: '999px' },
  lg: { base: '20px', xs: '6px', sm: '10px', md: '14px', lg: '20px', pill: '999px' },
  pill: { base: '999px', xs: '8px', sm: '12px', md: '16px', lg: '999px', pill: '999px' },
};

const SHADOWS: Record<ShadowId, { one: string; two: string }> = {
  none: { one: 'none', two: 'none' },
  soft: { one: '0 1px 2px rgb(0 0 0 / 6%)', two: '0 8px 24px rgb(0 0 0 / 8%)' },
  strong: { one: '0 2px 4px rgb(0 0 0 / 14%)', two: '0 16px 40px rgb(0 0 0 / 20%)' },
};

const CONTENT_WIDTHS: Record<ContentWidthId, string> = {
  narrow: '560px',
  prose: '720px',
  wide: '1200px',
  full: '1fr',
};

const PRESETS: PresetDef[] = [
  {
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
    advancedFields: ['scale', 'lineHeight', 'density', 'radius', 'contentWidth', 'shadow', 'motion', 'breakpoints'],
  },
  {
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
    advancedFields: ['scale', 'lineHeight', 'contentWidth'],
  },
  {
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
    advancedFields: ['scale', 'contentWidth', 'shadow', 'motion'],
  },
  {
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
    advancedFields: [],
  },
  {
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
    advancedFields: ['radius', 'shadow', 'motion'],
  },
  {
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
    advancedFields: ['radius', 'contentWidth'],
  },
];

const COLOR_VARS: Record<keyof Palette, string> = {
  accent: '--pv-accent',
  accentSoft: '--pv-accent-soft',
  onAccent: '--pv-on-accent',
  bg: '--pv-bg',
  surface: '--pv-surface',
  text: '--pv-text',
  text2: '--pv-text-2',
  text3: '--pv-text-3',
  line: '--pv-line',
  scrim: '--pv-scrim',
};

const COLOR_KEYS = Object.keys(COLOR_VARS) as (keyof Palette)[];

const SCALE_OPTIONS: { key: ScaleId; label: string }[] = [
  { key: 'compact', label: '紧凑' },
  { key: 'normal', label: '标准' },
  { key: 'spacious', label: '宽松' },
];

const LINE_HEIGHT_OPTIONS: { key: LineHeightId; label: string }[] = [
  { key: 'tight', label: '紧' },
  { key: 'normal', label: '标准' },
  { key: 'loose', label: '松' },
];

const DENSITY_OPTIONS: { key: DensityId; label: string }[] = [
  { key: 'compact', label: '紧凑' },
  { key: 'normal', label: '标准' },
];

const FONT_OPTIONS = [
  { value: 'sans', label: '无衬线（系统）' },
  { value: 'serif', label: '衬线' },
  { value: 'mono', label: '等宽' },
  { value: 'custom', label: '自定义字体栈' },
];

const SCHEME_OPTIONS = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '始终浅色' },
  { value: 'dark', label: '始终深色' },
];

const RADIUS_OPTIONS = [
  { value: 'none', label: '无圆角' },
  { value: 'sm', label: '小（6px）' },
  { value: 'md', label: '中（12px）' },
  { value: 'lg', label: '大（20px）' },
  { value: 'pill', label: '胶囊' },
];

const WIDTH_OPTIONS = [
  { value: 'narrow', label: '窄（560px）' },
  { value: 'prose', label: '正文（720px）' },
  { value: 'wide', label: '宽（1200px）' },
  { value: 'full', label: '通栏' },
];

const SHADOW_OPTIONS = [
  { value: 'none', label: '无阴影' },
  { value: 'soft', label: '柔和' },
  { value: 'strong', label: '强烈' },
];

const session = useSession();

const state = ref<'loading' | 'ready' | 'error'>('loading');
const errorText = ref('');
const saving = ref(false);
const rejected = ref<string[]>([]);
const rawConfig = ref<Record<string, unknown> | null>(null);
const savedSnapshot = ref('');
const loaded = ref(false);
const previewScheme = ref<SchemeName>('light');

const draft = reactive<ThemeDraft>({
  preset: null,
  colorScheme: 'auto',
  hue: 250,
  colors: { light: {}, dark: {} },
  font: 'sans',
  fontStack: '',
  scale: 'normal',
  lineHeight: 'normal',
  density: 'normal',
  radius: 'md',
  contentWidth: 'prose',
  shadow: 'none',
  motion: true,
  breakpoints: DEFAULT_BREAKPOINTS.map((bp) => ({ ...bp })),
});

const REJECT_LABELS: Record<string, string> = {
  version: '配置版本号',
  'site.url': '站点地址',
  'site.base': '站点 base 路径',
  'site.lang': '站点语言',
  'site.title': '站点标题',
  'site.description': '站点简介',
  'theme.hue': '色相',
  'theme.preset': '预设主题',
  'theme.scale': '字号刻度',
  'theme.radius': '圆角',
  'theme.contentWidth': '内容宽度',
  'theme.breakpoints': '响应式断点',
  'posts.pageSize': '每页篇数',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value)
    : fallback;
}

function presetOf(id: unknown): PresetDef | null {
  if (typeof id !== 'string') return null;
  return PRESETS.find((preset) => preset.id === id) ?? null;
}

function normalizeColors(value: unknown): { light: Partial<Palette>; dark: Partial<Palette> } {
  const out: { light: Partial<Palette>; dark: Partial<Palette> } = { light: {}, dark: {} };
  if (!isRecord(value)) return out;
  for (const scheme of ['light', 'dark'] as const) {
    const source = value[scheme];
    if (!isRecord(source)) continue;
    for (const key of COLOR_KEYS) {
      const color = source[key];
      if (typeof color === 'string' && color.trim()) out[scheme][key] = color.trim();
    }
  }
  return out;
}

/** 与 packages/template 的 resolveTheme 保持一致：显式字段优先，缺省取预设，再无则走 1.x 默认。 */
function normalizeTheme(value: unknown): ThemeDraft {
  const theme = isRecord(value) ? value : {};
  const preset = presetOf(theme.preset);
  return {
    preset: preset ? preset.id : null,
    colorScheme: pickEnum(theme.colorScheme, ['auto', 'light', 'dark'] as const, 'auto'),
    hue: pickNumber(theme.hue, 250, 0, 360),
    colors: normalizeColors(theme.colors),
    font: pickEnum(
      theme.font,
      ['sans', 'serif', 'mono', 'mono-heading', 'custom'] as const,
      preset?.font ?? 'sans',
    ),
    fontStack: typeof theme.fontStack === 'string' ? theme.fontStack : '',
    scale: pickEnum(
      theme.scale,
      ['compact', 'normal', 'spacious'] as const,
      preset?.scale ?? 'normal',
    ),
    lineHeight: pickEnum(
      theme.lineHeight,
      ['tight', 'normal', 'loose'] as const,
      preset?.lineHeight ?? 'normal',
    ),
    density: pickEnum(theme.density, ['compact', 'normal'] as const, preset?.density ?? 'normal'),
    radius: pickEnum(
      theme.radius,
      ['none', 'sm', 'md', 'lg', 'pill'] as const,
      preset?.radius ?? 'md',
    ),
    contentWidth: pickEnum(
      theme.contentWidth,
      ['narrow', 'prose', 'wide', 'full'] as const,
      preset?.contentWidth ?? 'prose',
    ),
    shadow: pickEnum(theme.shadow, ['none', 'soft', 'strong'] as const, preset?.shadow ?? 'none'),
    motion: typeof theme.motion === 'boolean' ? theme.motion : (preset?.motion ?? true),
    breakpoints: normalizeBreakpoints(theme.breakpoints),
  };
}

/** 断点表：非法/重复/超量时回退默认；按 maxWidth 升序返回。 */
function normalizeBreakpoints(value: unknown): BreakpointDraft[] {
  if (!Array.isArray(value)) return DEFAULT_BREAKPOINTS.map((bp) => ({ ...bp }));
  const seen = new Set<string>();
  const widths = new Set<number>();
  const rows: BreakpointDraft[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    const maxWidth = typeof item.maxWidth === 'number' ? Math.round(item.maxWidth) : NaN;
    if (!BP_ID.test(id) || seen.has(id)) continue;
    if (!Number.isFinite(maxWidth) || maxWidth < 320 || maxWidth > 3840) continue;
    if (widths.has(maxWidth)) continue;
    seen.add(id);
    widths.add(maxWidth);
    rows.push({ id, label: label || id, maxWidth });
  }
  rows.sort((a, b) => a.maxWidth - b.maxWidth);
  return rows.length > 0 ? rows.slice(0, MAX_BREAKPOINTS) : DEFAULT_BREAKPOINTS.map((bp) => ({ ...bp }));
}

function copyTheme(target: ThemeDraft, source: ThemeDraft): void {
  target.preset = source.preset;
  target.colorScheme = source.colorScheme;
  target.hue = source.hue;
  target.colors = {
    light: { ...source.colors.light },
    dark: { ...source.colors.dark },
  };
  target.font = source.font;
  target.fontStack = source.fontStack;
  target.scale = source.scale;
  target.lineHeight = source.lineHeight;
  target.density = source.density;
  target.radius = source.radius;
  target.contentWidth = source.contentWidth;
  target.shadow = source.shadow;
  target.motion = source.motion;
  target.breakpoints = source.breakpoints.map((bp) => ({ ...bp }));
}

function snapshotOf(value: ThemeDraft): string {
  return JSON.stringify({
    preset: value.preset,
    colorScheme: value.colorScheme,
    hue: value.hue,
    colors: {
      light: { ...value.colors.light },
      dark: { ...value.colors.dark },
    },
    font: value.font,
    fontStack: value.fontStack,
    scale: value.scale,
    lineHeight: value.lineHeight,
    density: value.density,
    radius: value.radius,
    contentWidth: value.contentWidth,
    shadow: value.shadow,
    motion: value.motion,
    breakpoints: value.breakpoints.map((bp) => `${bp.id}:${bp.label}:${bp.maxWidth}`),
  });
}

const dirty = computed(() => loaded.value && snapshotOf(draft) !== savedSnapshot.value);

/** 已保存过的断点 id 不允许改（类名已经写进内容）；新加的、还没保存的可以改。 */
const lockedBpIds = ref<string[]>([]);

const bpErrors = computed<string[]>(() => {
  const errors: string[] = [];
  const rows = draft.breakpoints;
  if (rows.length === 0) errors.push('至少保留一个断点');
  if (rows.length > MAX_BREAKPOINTS) errors.push(`最多 ${MAX_BREAKPOINTS} 个断点`);
  const ids = new Set<string>();
  const widths = new Set<number>();
  for (const row of rows) {
    if (!BP_ID.test(row.id)) errors.push(`标识「${row.id}」只能用小写字母、数字和连字符，且以字母开头`);
    else if (ids.has(row.id)) errors.push(`标识「${row.id}」重复`);
    ids.add(row.id);
    if (!row.label.trim()) errors.push(`断点「${row.id}」缺少名称`);
    if (!Number.isFinite(row.maxWidth) || row.maxWidth < 320 || row.maxWidth > 3840) {
      errors.push(`断点「${row.id}」的最大宽度要在 320–3840 之间`);
    } else if (widths.has(row.maxWidth)) {
      errors.push(`最大宽度 ${row.maxWidth}px 重复`);
    }
    widths.add(row.maxWidth);
  }
  return [...new Set(errors)];
});

function addBreakpoint(): void {
  if (draft.breakpoints.length >= MAX_BREAKPOINTS) return;
  const largest = draft.breakpoints.reduce((max, bp) => Math.max(max, bp.maxWidth), 767);
  const nextWidth = Math.min(3840, largest + 160);
  let index = draft.breakpoints.length + 1;
  let id = `bp${index}`;
  const used = new Set(draft.breakpoints.map((bp) => bp.id));
  while (used.has(id)) id = `bp${++index}`;
  draft.breakpoints = [
    ...draft.breakpoints,
    { id, label: `断点 ${draft.breakpoints.length + 1}`, maxWidth: nextWidth },
  ];
  draft.breakpoints.sort((a, b) => a.maxWidth - b.maxWidth);
}

function removeBreakpoint(id: string): void {
  if (draft.breakpoints.length <= 1) return;
  if (lockedBpIds.value.includes(id)) {
    notify(
      '这个断点已经保存过，内容里可能已经有它的类名。删除后旧类名会失效，建议先在文章里清掉对应覆盖。',
      'info',
      'appearance-breakpoints',
    );
  }
  draft.breakpoints = draft.breakpoints.filter((bp) => bp.id !== id);
}

function resetBreakpoints(): void {
  draft.breakpoints = DEFAULT_BREAKPOINTS.map((bp) => ({ ...bp }));
}

function sortBreakpoints(): void {
  draft.breakpoints.sort((a, b) => a.maxWidth - b.maxWidth);
}

const activePreset = computed<PresetDef | null>(() =>
  draft.preset ? (presetOf(draft.preset) ?? null) : null,
);

const ALL_ADVANCED: AdvancedField[] = [
  'scale',
  'lineHeight',
  'density',
  'radius',
  'contentWidth',
  'shadow',
  'motion',
  'breakpoints',
];

function allows(field: AdvancedField): boolean {
  if (!activePreset.value) return true;
  return activePreset.value.advancedFields.includes(field);
}

const advancedTokenOpen = computed(() =>
  ALL_ADVANCED.some((field) => field !== 'breakpoints' && allows(field)),
);

const fontOptions = computed(() =>
  draft.font === 'mono-heading'
    ? [...FONT_OPTIONS, { value: 'mono-heading', label: '等宽标题（旧配置）' }]
    : FONT_OPTIONS,
);

const hueNote = computed(() =>
  activePreset.value
    ? '拖动色相会把色板切到「按色相派生」的自定义模式，不再使用预设色板。'
    : '当前是自定义色板：整套颜色由色相派生（与 1.x 的 hue 行为一致）。',
);

const paletteBadges = computed(() => {
  const preset = activePreset.value;
  const scheme = previewScheme.value;
  const palette = preset ? preset.colors[scheme] : huePalette(draft.hue, scheme);
  return [
    { label: '背景', value: palette.bg },
    { label: '表面', value: palette.surface },
    { label: '强调', value: palette.accent },
    { label: '正文', value: palette.text },
  ];
});

const tokenRows = computed(() => {
  const vars = previewVars.value;
  return [
    { name: '--color-accent', value: vars['--pv-accent'] ?? '' },
    { name: '--radius', value: vars['--pv-radius-lg'] ?? '' },
    { name: '--space-4', value: vars['--pv-space-4'] ?? '' },
    { name: '--font-size-body', value: vars['--pv-fs-md'] ?? '' },
    { name: '--shadow-1', value: vars['--pv-shadow-1'] ?? '' },
  ];
});

/** 1.x 的无预设模式：整套色板由 --hue 派生（镜像 base.css 的 oklch 公式）。 */
function huePalette(hue: number, scheme: SchemeName): Palette {
  if (scheme === 'dark') {
    return {
      accent: `oklch(0.75 0.13 ${hue})`,
      accentSoft: `oklch(0.28 0.05 ${hue})`,
      onAccent: '#0d1017',
      bg: `oklch(0.17 0.01 ${hue})`,
      surface: `oklch(0.21 0.012 ${hue})`,
      text: `oklch(0.9 0.01 ${hue})`,
      text2: `oklch(0.7 0.015 ${hue})`,
      text3: `oklch(0.78 0.012 ${hue})`,
      line: `oklch(0.3 0.012 ${hue})`,
      scrim: 'rgb(0 0 0 / 60%)',
    };
  }
  return {
    accent: `oklch(0.55 0.15 ${hue})`,
    accentSoft: `oklch(0.95 0.03 ${hue})`,
    onAccent: '#ffffff',
    bg: `oklch(0.99 0.003 ${hue})`,
    surface: `oklch(0.97 0.006 ${hue})`,
    text: `oklch(0.28 0.02 ${hue})`,
    text2: `oklch(0.5 0.02 ${hue})`,
    text3: `oklch(0.48 0.015 ${hue})`,
    line: `oklch(0.91 0.01 ${hue})`,
    scrim: 'rgb(0 0 0 / 40%)',
  };
}

function px(value: number): string {
  return `${Math.round(value * 10) / 10}px`;
}

/** 本地计算预览用的 CSS 变量，不写盘、不起 dev server。 */
const previewVars = computed<Record<string, string>>(() => {
  const scheme = previewScheme.value;
  const preset = activePreset.value;
  const base = preset ? preset.colors[scheme] : huePalette(draft.hue, scheme);
  const palette: Palette = { ...base, ...draft.colors[scheme] };
  const scaleFactor = SCALE_FACTOR[draft.scale];
  const spaceFactor = scaleFactor * DENSITY_FACTOR[draft.density];
  const radius = RADII[draft.radius];
  const shadow = SHADOWS[draft.shadow];
  const lineHeight = LINE_HEIGHTS[draft.lineHeight];
  const customStack = draft.fontStack.trim();
  const fontBody =
    customStack ||
    FONT_STACKS[draft.font === 'mono-heading' ? 'sans' : draft.font] ||
    FONT_STACKS.sans;
  const fontHeading =
    draft.font === 'mono' || draft.font === 'mono-heading' ? FONT_STACKS.mono : fontBody;

  const vars: Record<string, string> = {};
  for (const key of COLOR_KEYS) vars[COLOR_VARS[key]] = palette[key];
  vars['--pv-font-body'] = fontBody;
  vars['--pv-font-heading'] = fontHeading;
  vars['--pv-font-mono'] = FONT_STACKS.mono;
  vars['--pv-weight-heading'] = String(preset?.headingWeight ?? 600);
  vars['--pv-fs-xs'] = px(BASE_FONT_SIZES.xs * scaleFactor);
  vars['--pv-fs-sm'] = px(BASE_FONT_SIZES.sm * scaleFactor);
  vars['--pv-fs-base'] = px(BASE_FONT_SIZES.base * scaleFactor);
  vars['--pv-fs-md'] = px(BASE_FONT_SIZES.md * scaleFactor);
  vars['--pv-fs-lg'] = px(BASE_FONT_SIZES.lg * scaleFactor);
  vars['--pv-fs-xl'] = px(BASE_FONT_SIZES.xl * scaleFactor);
  vars['--pv-fs-2xl'] = px(BASE_FONT_SIZES['2xl'] * scaleFactor);
  vars['--pv-fs-3xl'] = px(BASE_FONT_SIZES['3xl'] * scaleFactor);
  vars['--pv-fs-body'] = px(BASE_FONT_SIZES.md * scaleFactor);
  BASE_SPACES.forEach((value, index) => {
    vars[`--pv-space-${index + 1}`] = px(value * spaceFactor);
  });
  vars['--pv-radius-lg'] = radius.lg;
  vars['--pv-radius-md'] = radius.md;
  vars['--pv-radius-sm'] = radius.sm;
  vars['--pv-radius-pill'] = radius.pill;
  vars['--pv-shadow-1'] = shadow.one;
  vars['--pv-shadow-2'] = shadow.two;
  vars['--pv-lh-body'] = String(lineHeight.body);
  vars['--pv-lh-heading'] = String(lineHeight.heading);
  vars['--pv-w-content'] =
    draft.contentWidth === 'full' ? '100%' : CONTENT_WIDTHS[draft.contentWidth];
  vars['--pv-dur'] = draft.motion ? '150ms' : '0ms';
  return vars;
});

const hue = computed({
  get: () => draft.hue,
  set: (value: number) => {
    draft.hue = value;
    // 预设色板不受色相影响，拖动色相即切到「按色相派生」的自定义模式。
    draft.preset = null;
  },
});

const colorScheme = computed({
  get: () => draft.colorScheme,
  set: (value: string | number) => {
    draft.colorScheme = pickEnum(value, ['auto', 'light', 'dark'] as const, 'auto');
  },
});

const font = computed({
  get: () => draft.font,
  set: (value: string | number) => {
    draft.font = pickEnum(
      value,
      ['sans', 'serif', 'mono', 'mono-heading', 'custom'] as const,
      'sans',
    );
  },
});

const scale = computed({
  get: () => draft.scale,
  set: (value: string) => {
    draft.scale = pickEnum(value, ['compact', 'normal', 'spacious'] as const, 'normal');
  },
});

const lineHeight = computed({
  get: () => draft.lineHeight,
  set: (value: string) => {
    draft.lineHeight = pickEnum(value, ['tight', 'normal', 'loose'] as const, 'normal');
  },
});

const density = computed({
  get: () => draft.density,
  set: (value: string) => {
    draft.density = pickEnum(value, ['compact', 'normal'] as const, 'normal');
  },
});

const radius = computed({
  get: () => draft.radius,
  set: (value: string | number) => {
    draft.radius = pickEnum(value, ['none', 'sm', 'md', 'lg', 'pill'] as const, 'md');
  },
});

const contentWidth = computed({
  get: () => draft.contentWidth,
  set: (value: string | number) => {
    draft.contentWidth = pickEnum(
      value,
      ['narrow', 'prose', 'wide', 'full'] as const,
      'prose',
    );
  },
});

const shadow = computed({
  get: () => draft.shadow,
  set: (value: string | number) => {
    draft.shadow = pickEnum(value, ['none', 'soft', 'strong'] as const, 'none');
  },
});

const motion = computed({
  get: () => draft.motion,
  set: (value: boolean) => {
    draft.motion = value;
  },
});

const previewSchemeModel = computed({
  get: () => previewScheme.value,
  set: (value: string) => {
    previewScheme.value = value === 'dark' ? 'dark' : 'light';
  },
});

const fontStackVisible = computed(() => draft.font === 'custom' || Boolean(draft.fontStack.trim()));

function applyPreset(preset: PresetDef): void {
  draft.preset = preset.id;
  draft.font = preset.font;
  draft.fontStack = '';
  draft.colors = { light: {}, dark: {} };
  draft.scale = preset.scale;
  draft.lineHeight = preset.lineHeight;
  draft.density = preset.density;
  draft.radius = preset.radius;
  draft.contentWidth = preset.contentWidth;
  draft.shadow = preset.shadow;
  draft.motion = preset.motion;
  if (!preset.advancedFields.includes('breakpoints')) resetBreakpoints();
  void save();
}

function applyDefaultPreset(): void {
  const preset = presetOf('midnight');
  if (preset) applyPreset(preset);
}

function presetSwatches(preset: PresetDef): { light: string[]; dark: string[] } {
  return {
    light: [preset.colors.light.bg, preset.colors.light.surface, preset.colors.light.accent],
    dark: [preset.colors.dark.bg, preset.colors.dark.surface, preset.colors.dark.accent],
  };
}

function resetDraft(): void {
  if (!savedSnapshot.value) return;
  const snapshot = JSON.parse(savedSnapshot.value) as ThemeDraft;
  copyTheme(draft, snapshot);
  rejected.value = [];
  session.setSaveState('saved');
}

/** 组新的完整配置：只覆盖 theme 里本页负责的字段，其余原样保留（未知字段、seo、posts…）。 */
function buildConfig(): Record<string, unknown> | null {
  if (!rawConfig.value) return null;
  const next: Record<string, unknown> = { ...rawConfig.value };
  const theme: Record<string, unknown> = isRecord(next.theme) ? { ...next.theme } : {};
  if (draft.preset) theme.preset = draft.preset;
  else delete theme.preset;
  theme.colorScheme = draft.colorScheme;
  theme.hue = draft.hue;
  if (Object.keys(draft.colors.light).length || Object.keys(draft.colors.dark).length) {
    theme.colors = {
      light: { ...draft.colors.light },
      dark: { ...draft.colors.dark },
    };
  } else {
    delete theme.colors;
  }
  theme.font = draft.font;
  if (draft.fontStack.trim()) theme.fontStack = draft.fontStack.trim();
  else delete theme.fontStack;
  theme.scale = draft.scale;
  theme.lineHeight = draft.lineHeight;
  theme.density = draft.density;
  theme.radius = draft.radius;
  theme.contentWidth = draft.contentWidth;
  theme.shadow = draft.shadow;
  theme.motion = draft.motion;
  const breakpoints = draft.breakpoints.map((bp) => ({
    id: bp.id,
    label: bp.label.trim() || bp.id,
    maxWidth: Math.round(bp.maxWidth),
  }));
  const sameAsDefault =
    breakpoints.length === DEFAULT_BREAKPOINTS.length &&
    breakpoints.every((bp, index) => {
      const base = DEFAULT_BREAKPOINTS[index];
      return base ? bp.id === base.id && bp.maxWidth === base.maxWidth : false;
    });
  if (sameAsDefault) delete theme.breakpoints;
  else theme.breakpoints = breakpoints;
  next.theme = theme;
  return next;
}

async function load(): Promise<void> {
  if (!session.siteDir) {
    state.value = 'error';
    return;
  }
  state.value = 'loading';
  errorText.value = '';
  rejected.value = [];
  const result = await window.xiao.settings.read(session.siteDir);
  if (!result.ok) {
    state.value = 'error';
    errorText.value = result.message;
    loaded.value = false;
    session.setSaveState('saved');
    return;
  }
  const config = isRecord(result.data) ? result.data : {};
  rawConfig.value = config;
  const normalized = normalizeTheme(config.theme);
  copyTheme(draft, normalized);
  lockedBpIds.value = normalized.breakpoints.filter((bp) =>
    DEFAULT_BREAKPOINTS.some((item) => item.id === bp.id),
  ).map((bp) => bp.id);
  lockedBpIds.value = normalized.breakpoints.map((bp) => bp.id);
  savedSnapshot.value = snapshotOf(normalized);
  previewScheme.value = normalized.colorScheme === 'dark' ? 'dark' : 'light';
  loaded.value = true;
  session.setSaveState('saved');
  state.value = 'ready';
}

async function save(): Promise<void> {
  if (saving.value || !loaded.value || !session.siteDir) return;
  if (bpErrors.value.length > 0) {
    notify(`断点没填对：${bpErrors.value[0]}。改好后再保存。`, 'error', 'appearance-save');
    return;
  }
  const next = buildConfig();
  if (!next) return;
  // 写盘期间用户可能继续改令牌；用开始写盘时的快照，避免把后续改动误标成已保存。
  const snapshotAtSave = snapshotOf(draft);
  saving.value = true;
  rejected.value = [];
  session.setSaveState('saving');
  let result: Awaited<ReturnType<typeof window.xiao.settings.write>> | null = null;
  try {
    // rawConfig 存在 ref 里会变成响应式代理，直接送 IPC 会抛 An object could not be cloned。
    const payload = JSON.parse(JSON.stringify(next)) as Record<string, unknown>;
    result = await window.xiao.settings.write(session.siteDir, payload);
  } catch (error) {
    session.setSaveState('dirty');
    const message = error instanceof Error ? error.message : '保存失败';
    notify(`没有写入：${message}`, 'error', 'appearance-save');
    return;
  } finally {
    saving.value = false;
  }
  if (!result.ok) {
    session.setSaveState('dirty');
    notify(result.message, 'error', 'appearance-save');
    return;
  }
  if (result.data.length > 0) {
    rejected.value = result.data;
    session.setSaveState('dirty');
    const labels = result.data.map((item) => REJECT_LABELS[item] ?? item).join('、');
    notify(`没有写入：${labels}。检查这些字段后重试。`, 'error', 'appearance-save');
    return;
  }
  rawConfig.value = next;
  savedSnapshot.value = snapshotAtSave;
  session.setSaveState(dirty.value ? 'dirty' : 'saved');
  notify('已写入。预览会重新载入当前页。', 'info', 'appearance-save');
  void refreshPreview(false);
}

async function refreshPreview(announce = true): Promise<void> {
  const result = await window.xiao.preview.reload();
  if (!announce) return;
  if (!result.ok) {
    notify(`预览没能刷新：${result.message}`, 'error', 'appearance-preview');
    return;
  }
  if (!session.previewUrl && !session.previewWindowOpen) {
    notify('配置已在磁盘上。打开页面或文章预览后，再点一次「刷新预览」。', 'info', 'appearance-preview');
  }
}

function openCustomCss(): void {
  if (session.mode !== 'develop') {
    notify('先切到开发者模式（Ctrl+Shift+D），右侧抽屉里就能编辑 custom.css', 'info');
    return;
  }
  session.editCustomCss();
  notify('已在开发者抽屉打开 src/styles/custom.css', 'info', 'appearance-save');
}

function onSaveShortcut(): void {
  if (dirty.value) void save();
}

watch(dirty, (value) => {
  if (!saving.value) session.setSaveState(value ? 'dirty' : 'saved');
});

watch(
  () => draft.colorScheme,
  (value) => {
    if (value === 'dark' || value === 'light') previewScheme.value = value;
  },
);

watch(
  () => session.siteDir,
  () => void load(),
);

onMounted(() => {
  window.addEventListener('xiao:save', onSaveShortcut);
  void load();
});

onBeforeUnmount(() => {
  window.removeEventListener('xiao:save', onSaveShortcut);
});
</script>

<template>
  <section class="appearance">
    <UiEmpty
      v-if="!session.siteDir"
      title="先打开一个站点"
      description="外观属于某个站点的 xiao.config.json；打开站点后就能在这里换预设、调令牌。"
      :icon="icons.appearance"
    />

    <div v-else-if="state === 'loading'" class="state" role="status">
      <UiSpinner :size="18" label="读取配置" />
      <span>正在读取站点配置…</span>
    </div>

    <UiEmpty
      v-else-if="state === 'error'"
      title="读不到站点配置"
      :description="
        errorText
          ? `发生了什么：${errorText}。怎么办：确认站点文件夹里有 xiao.config.json，或从欢迎页重新打开站点。`
          : '发生了什么：站点目录为空。怎么办：从欢迎页重新打开站点。'
      "
      :icon="icons.alert"
    >
      <template #action>
        <UiButton variant="primary" size="sm" @click="load">重试</UiButton>
      </template>
    </UiEmpty>

    <div v-else class="appearance-body">
      <div class="appearance-main">
        <header class="page-head">
          <div class="page-titles">
            <h2>外观</h2>
            <p>预设决定整体气质，令牌决定字号、间距与圆角。保存后点「刷新预览」，正在看的页面会按新配置重载。</p>
          </div>
          <div class="page-actions">
            <UiBadge :tone="dirty ? 'warn' : 'ok'" dot>{{ dirty ? '有未保存改动' : '已保存' }}</UiBadge>
            <UiButton @click="refreshPreview()">刷新预览</UiButton>
            <UiButton
              :icon="icons.refresh"
              aria-label="还原未保存的改动"
              :disabled="!dirty || saving"
              @click="resetDraft"
            />
            <UiButton variant="primary" :icon-left="icons.save" :loading="saving" :disabled="!dirty" @click="save">
              保存
            </UiButton>
          </div>
        </header>

        <div v-if="rejected.length" class="alert" role="alert">
          <UiIcon :path="icons.alert" :size="16" />
          <div>
            <strong>没有写入，这些字段被拒绝：</strong>
            <ul>
              <li v-for="field in rejected" :key="field">{{ REJECT_LABELS[field] ?? field }}</li>
            </ul>
            <span>改好后再点保存；配置本身没有被改动。</span>
          </div>
        </div>

        <UiPanel title="预设主题">
          <template #actions>
            <UiBadge v-if="!draft.preset" tone="accent">自定义</UiBadge>
            <UiBadge v-else tone="neutral">{{ activePreset?.name }}</UiBadge>
          </template>
          <p class="section-lead">
            点一张卡片就切换到该预设，并把字体、刻度、圆角等对应字段一起写回配置。
          </p>
          <div class="preset-grid">
            <button
              v-for="preset in PRESETS"
              :key="preset.id"
              type="button"
              class="preset-card"
              :class="{ 'is-active': draft.preset === preset.id }"
              :aria-pressed="draft.preset === preset.id"
              @click="applyPreset(preset)"
            >
              <span class="preset-head">
                <span class="preset-name">{{ preset.name }}</span>
                <UiIcon v-if="draft.preset === preset.id" :path="icons.check" :size="14" class="preset-check" />
              </span>
              <span class="preset-desc">{{ preset.summary }}</span>
              <span class="preset-swatches" aria-hidden="true">
                <span class="swatch-row">
                  <span
                    v-for="(color, index) in presetSwatches(preset).light"
                    :key="`light-${index}`"
                    class="swatch"
                    :style="{ background: color }"
                  />
                </span>
                <span class="swatch-row">
                  <span
                    v-for="(color, index) in presetSwatches(preset).dark"
                    :key="`dark-${index}`"
                    class="swatch"
                    :style="{ background: color }"
                  />
                </span>
              </span>
            </button>
          </div>
          <div v-if="!draft.preset" class="custom-note">
            <div>
              <strong>当前是自定义色板</strong>
              <span>没有使用预设，整套颜色由色相派生（1.x 的做法）。</span>
            </div>
            <UiButton size="sm" @click="applyDefaultPreset">用回「深夜」</UiButton>
          </div>
        </UiPanel>

        <UiPanel title="基础">
          <p class="section-lead">主色调和字体每个套件都能改。</p>
          <div class="token-grid">
            <UiField label="亮暗模式" hint="auto 跟随系统；站点右上角仍可临时切换。">
              <UiSelect v-model="colorScheme" :options="SCHEME_OPTIONS" />
            </UiField>
            <UiField label="色相" :hint="hueNote">
              <UiSlider v-model="hue" :min="0" :max="360" unit="°" />
            </UiField>
            <UiField label="字体">
              <UiSelect v-model="font" :options="fontOptions" />
            </UiField>
            <UiField
              v-if="fontStackVisible"
              label="自定义字体栈"
              hint="按 CSS font-family 写法填，例如 'Source Han Serif SC', serif。"
            >
              <UiInput v-model="draft.fontStack" placeholder="'Noto Serif SC', serif" />
            </UiField>
          </div>
          <div class="palette-strip">
            <UiBadge tone="neutral">色板小样（{{ previewScheme === 'light' ? '浅色' : '深色' }}）</UiBadge>
            <div class="palette-badges">
              <span v-for="item in paletteBadges" :key="item.label" class="palette-badge">
                <span class="palette-chip" :style="{ background: item.value }" aria-hidden="true" />
                <span>{{ item.label }}</span>
              </span>
            </div>
          </div>
          <p v-if="activePreset && !advancedTokenOpen && !allows('breakpoints')" class="section-lead">
            这个套件只开放主色调和字体。
          </p>
        </UiPanel>

        <UiPanel v-if="advancedTokenOpen" title="高级">
          <p class="section-lead">只显示当前套件开放的项。切换套件时，没开放的项会回到该套件的默认值。</p>
          <div class="token-grid">
            <UiField v-if="allows('scale')" label="字号刻度" hint="同时缩放字号与组件间距，保证按钮、卡片、正文一起变。">
              <UiSegmented v-model="scale" :items="SCALE_OPTIONS" />
            </UiField>
            <UiField v-if="allows('lineHeight')" label="行高">
              <UiSegmented v-model="lineHeight" :items="LINE_HEIGHT_OPTIONS" />
            </UiField>
            <UiField v-if="allows('density')" label="密度" hint="只压缩间距，不缩字号。">
              <UiSegmented v-model="density" :items="DENSITY_OPTIONS" />
            </UiField>
            <UiField v-if="allows('radius')" label="圆角">
              <UiSelect v-model="radius" :options="RADIUS_OPTIONS" />
            </UiField>
            <UiField v-if="allows('contentWidth')" label="内容宽度">
              <UiSelect v-model="contentWidth" :options="WIDTH_OPTIONS" />
            </UiField>
            <UiField v-if="allows('shadow')" label="阴影">
              <UiSelect v-model="shadow" :options="SHADOW_OPTIONS" />
            </UiField>
            <UiField v-if="allows('motion')" label="动效" hint="关闭后过渡时长归零，尊重系统的“减少动态效果”。">
              <div class="switch-row">
                <UiSwitch v-model="motion" />
                <span>{{ motion ? '开启' : '关闭' }}</span>
              </div>
            </UiField>
          </div>
        </UiPanel>

        <UiPanel v-if="allows('breakpoints')" title="断点">
          <p class="section-lead">
            断点决定「平板 / 手机」这类样式在哪些宽度生效。默认：平板 ≤1023、手机 ≤767。改成自己的数值后
            <strong>保存后点「刷新预览」</strong>才生效。标识会写进样式类名（如 <code>x-md-pad-lg</code>），
            已保存的标识不要改；删掉断点后，内容里它的旧类名会失效（不会自动清理）。
          </p>
          <div class="bp-list">
            <div v-for="bp in draft.breakpoints" :key="bp.id" class="bp-row">
              <UiField label="名称">
                <UiInput v-model="bp.label" />
              </UiField>
              <UiField label="最大宽度 (px)">
                <UiInput
                  v-model.number="bp.maxWidth"
                  type="number"
                  :min="320"
                  :max="3840"
                  @change="sortBreakpoints"
                />
              </UiField>
              <UiField label="标识" hint="类名前缀">
                <UiInput v-model="bp.id" :disabled="lockedBpIds.includes(bp.id)" />
              </UiField>
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.trash"
                :disabled="draft.breakpoints.length <= 1"
                aria-label="删除断点"
                :title="`删除断点 ${bp.label}`"
                @click="removeBreakpoint(bp.id)"
              />
            </div>
          </div>
          <div class="bp-actions">
            <UiButton
              size="sm"
              :icon-left="icons.plus"
              :disabled="draft.breakpoints.length >= MAX_BREAKPOINTS"
              @click="addBreakpoint"
            >
              添加断点
            </UiButton>
            <UiButton size="sm" variant="ghost" @click="resetBreakpoints">恢复默认</UiButton>
            <span class="bp-count">{{ draft.breakpoints.length }} / {{ MAX_BREAKPOINTS }}</span>
          </div>
          <p v-if="bpErrors.length" class="bp-errors">{{ bpErrors.join('；') }}</p>
        </UiPanel>

        <UiPanel title="高级 CSS" collapsible :default-open="false">
          <template v-if="session.mode === 'develop'">
            <p class="section-lead">
              站点自带 <code>src/styles/custom.css</code>，它在所有主题令牌之后加载，可以覆盖任意
              <code>--color-*</code> / <code>--space-*</code> 变量，也可以写自己的选择器。
            </p>
            <UiButton size="sm" :icon-left="icons.code" @click="openCustomCss">在开发者抽屉打开 custom.css</UiButton>
          </template>
          <p v-else class="section-lead">
            创作模式下不显示源码编辑。切到开发者模式（Ctrl+Shift+D）后，这里会出现“打开
            custom.css”的按钮；自定义样式会保存在站点目录里，不写入配置。
          </p>
        </UiPanel>
      </div>

      <aside class="preview" aria-label="实时预览">
        <header class="preview-head">
          <div class="preview-title">
            <UiIcon :path="icons.preview" :size="15" />
            <strong>实时预览</strong>
          </div>
          <UiSegmented
            v-model="previewSchemeModel"
            :items="[
              { key: 'light', label: '浅色' },
              { key: 'dark', label: '深色' },
            ]"
          />
        </header>
        <p class="preview-note">只在本地模拟令牌效果，不改站点文件。</p>

        <div class="preview-canvas" :style="previewVars">
          <div class="pv-topbar">
            <span class="pv-brand">晓</span>
            <span class="pv-nav">归档</span>
            <span class="pv-nav">标签</span>
            <span class="pv-nav">关于</span>
          </div>
          <div class="pv-content">
            <p class="pv-eyebrow">演示 · 令牌预览</p>
            <h3 class="pv-title">标题示例：把主题做成一套令牌</h3>
            <p class="pv-text">
              这是一段正文示例。字号、行高、间距、颜色都会跟随左侧令牌即时变化；卡片和按钮也一样，
              不需要启动 dev server。
            </p>
            <div class="pv-actions">
              <span class="pv-button pv-button--primary">开始阅读</span>
              <span class="pv-button pv-button--ghost">了解更多</span>
            </div>
            <article class="pv-card">
              <span class="pv-tag">随笔</span>
              <h4 class="pv-card-title">卡片标题</h4>
              <p class="pv-card-text">卡片、分隔线与标签都使用同一套令牌，改一处到处生效。</p>
            </article>
            <div class="pv-pills">
              <span class="pv-pill">随笔</span>
              <span class="pv-pill">长文</span>
              <span class="pv-pill">主题</span>
            </div>
          </div>
        </div>

        <dl class="token-readout">
          <template v-for="row in tokenRows" :key="row.name">
            <dt>{{ row.name }}</dt>
            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.appearance {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--ui-text);
}

.state {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s8);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.appearance-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  align-items: start;
  gap: var(--ui-s5);
  padding-bottom: var(--ui-s8);
}

.appearance-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
  min-width: 0;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-s4);
  flex-wrap: wrap;
}

.page-titles h2 {
  margin: 0 0 var(--ui-s1);
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

.page-titles p {
  max-width: 56ch;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.page-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  padding: var(--ui-s3);
  border: 1px solid var(--ui-danger-weak);
  border-radius: var(--ui-r);
  background: var(--ui-danger-weak);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
}

.alert ul {
  margin: var(--ui-s1) 0;
  padding-left: var(--ui-s4);
  color: var(--ui-text-2);
}

.alert span {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
}

.section-lead {
  margin-bottom: var(--ui-s3);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.section-lead code {
  padding: 1px 4px;
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.bp-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.bp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px 120px 32px;
  gap: var(--ui-s2);
  align-items: end;
  padding-bottom: var(--ui-s3);
  border-bottom: 1px dashed var(--ui-line);
}

.bp-row:last-child {
  border-bottom: 0;
}

.bp-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  margin-top: var(--ui-s2);
}

.bp-count {
  margin-left: auto;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.bp-errors {
  margin-top: var(--ui-s2);
  color: var(--ui-danger);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
  gap: var(--ui-s2);
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
  color: var(--ui-text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--ui-dur) var(--ui-ease),
    background var(--ui-dur) var(--ui-ease);
}

.preset-card:hover {
  border-color: var(--ui-line-2);
  background: var(--ui-hover);
}

.preset-card.is-active {
  border-color: var(--ui-accent);
  background: var(--ui-accent-weak);
}

.preset-card:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.preset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
}

.preset-name {
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.preset-check {
  color: var(--ui-accent);
}

.preset-desc {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.preset-swatches {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: var(--ui-s1);
}

.swatch-row {
  display: flex;
  gap: 3px;
}

.swatch {
  flex: 1;
  height: var(--ui-s4);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
}

.custom-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s3);
  margin-top: var(--ui-s3);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px dashed var(--ui-line-2);
  border-radius: var(--ui-r);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.custom-note strong {
  display: block;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
}

.token-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--ui-s3) var(--ui-s4);
}

.switch-row {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: var(--ui-h-md);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.palette-strip {
  display: flex;
  align-items: center;
  gap: var(--ui-s3);
  margin-top: var(--ui-s4);
  padding-top: var(--ui-s3);
  border-top: 1px solid var(--ui-line);
  flex-wrap: wrap;
}

.palette-badges {
  display: flex;
  gap: var(--ui-s2);
  flex-wrap: wrap;
}

.palette-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
}

.palette-chip {
  width: var(--ui-s4);
  height: var(--ui-s4);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
}

.preview {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  min-width: 0;
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
}

.preview-title {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
}

.preview-note {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.preview-canvas {
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--pv-bg);
  color: var(--pv-text);
  font-family: var(--pv-font-body);
  font-size: var(--pv-fs-base);
  line-height: var(--pv-lh-body);
}

.pv-topbar {
  display: flex;
  align-items: center;
  gap: var(--pv-space-4);
  padding: 0 var(--pv-space-4);
  min-height: calc(var(--pv-space-6) + var(--pv-space-2));
  border-bottom: 1px solid var(--pv-line);
  background: var(--pv-surface);
  color: var(--pv-text-2);
  font-size: var(--pv-fs-sm);
}

.pv-brand {
  margin-right: auto;
  color: var(--pv-text);
  font-family: var(--pv-font-heading);
  font-size: var(--pv-fs-lg);
  font-weight: var(--pv-weight-heading);
}

.pv-content {
  display: flex;
  flex-direction: column;
  gap: var(--pv-space-3);
  max-width: var(--pv-w-content);
  margin: 0 auto;
  padding: var(--pv-space-5) var(--pv-space-4);
}

.pv-eyebrow {
  color: var(--pv-text-3);
  font-size: var(--pv-fs-xs);
  letter-spacing: 0.08em;
}

.pv-title {
  margin: 0;
  color: var(--pv-text);
  font-family: var(--pv-font-heading);
  font-size: var(--pv-fs-2xl);
  font-weight: var(--pv-weight-heading);
  line-height: var(--pv-lh-heading);
}

.pv-text {
  color: var(--pv-text-2);
  font-size: var(--pv-fs-body);
  line-height: var(--pv-lh-body);
}

.pv-actions {
  display: flex;
  gap: var(--pv-space-2);
  flex-wrap: wrap;
}

.pv-button {
  display: inline-flex;
  align-items: center;
  min-height: calc(var(--pv-space-6) + var(--pv-space-1));
  padding: 0 var(--pv-space-4);
  border-radius: var(--pv-radius-pill);
  font-size: var(--pv-fs-base);
  transition:
    background var(--pv-dur),
    color var(--pv-dur);
}

.pv-button--primary {
  background: var(--pv-accent);
  color: var(--pv-on-accent);
}

.pv-button--ghost {
  border: 1px solid var(--pv-line);
  background: var(--pv-surface);
  color: var(--pv-text-2);
}

.pv-card {
  display: flex;
  flex-direction: column;
  gap: var(--pv-space-1);
  padding: var(--pv-space-4);
  border: 1px solid var(--pv-line);
  border-radius: var(--pv-radius-lg);
  background: var(--pv-surface);
  box-shadow: var(--pv-shadow-1);
}

.pv-tag {
  align-self: flex-start;
  padding: 1px var(--pv-space-2);
  border-radius: var(--pv-radius-pill);
  background: var(--pv-accent-soft);
  color: var(--pv-accent);
  font-size: var(--pv-fs-xs);
}

.pv-card-title {
  margin: 0;
  color: var(--pv-text);
  font-family: var(--pv-font-heading);
  font-size: var(--pv-fs-lg);
  font-weight: var(--pv-weight-heading);
  line-height: var(--pv-lh-heading);
}

.pv-card-text {
  color: var(--pv-text-2);
  font-size: var(--pv-fs-sm);
  line-height: var(--pv-lh-body);
}

.pv-pills {
  display: flex;
  gap: var(--pv-space-2);
  flex-wrap: wrap;
}

.pv-pill {
  display: inline-flex;
  align-items: center;
  min-height: calc(var(--pv-space-5) + var(--pv-space-1));
  padding: 0 var(--pv-space-3);
  border-radius: var(--pv-radius-pill);
  background: var(--pv-surface);
  color: var(--pv-text-2);
  font-size: var(--pv-fs-xs);
}

.token-readout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px var(--ui-s2);
  margin: 0;
  padding-top: var(--ui-s2);
  border-top: 1px solid var(--ui-line);
  font-size: var(--ui-fs-1);
}

.token-readout dt {
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-readout dd {
  margin: 0;
  overflow: hidden;
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .appearance-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .preview {
    position: static;
    order: -1;
  }
}
</style>
