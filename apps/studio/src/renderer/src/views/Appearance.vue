<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { ThemeManifest, ThemeOptionDef, ThemeOptionValue } from '../env';
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
  UiTextarea,
} from '../ui/index.ts';

/**
 * 外观页（D-99）：主题 / 主题配色 / 主题自定义项 三层。
 *
 * 三层的数据都来自站点自己的 src/theme.json（主题声明）：主题信息、它提供的几套配色、
 * 它开放的自定义项和默认值。这里不再镜像任何预设或尺寸表，换一个主题，页面自动跟着变。
 */

type Mode = 'auto' | 'light' | 'dark';
type SchemeName = 'light' | 'dark';
type Palette = Record<string, string>;
type PaletteDef = ThemeManifest['palettes']['items'][number];

interface BreakpointDraft {
  id: string;
  label: string;
  maxWidth: number;
}

interface Draft {
  palette: string | null;
  mode: Mode;
  hue: number;
  colors: { light: Palette; dark: Palette };
  options: Record<string, ThemeOptionValue>;
  breakpoints: BreakpointDraft[];
}

/** 断点：桌面（base）下按最大宽度生效，id 会进类名（x-<id>-pad-lg），建立后不建议改名。 */
const DEFAULT_BREAKPOINTS: BreakpointDraft[] = [
  { id: 'md', label: '平板', maxWidth: 1023 },
  { id: 'sm', label: '手机', maxWidth: 767 },
];
const BP_ID = /^[a-z][a-z0-9-]{1,16}$/;
const MAX_BREAKPOINTS = 6;

/** 旧版写在 theme 顶层的键：读的时候兼容，保存时迁移到 palette / mode / options 后删掉。 */
const LEGACY_THEME_KEYS = [
  'preset',
  'colorScheme',
  'font',
  'fontStack',
  'scale',
  'lineHeight',
  'density',
  'radius',
  'contentWidth',
  'shadow',
  'motion',
  'headingWeight',
];

const MODE_OPTIONS = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '始终浅色' },
  { value: 'dark', label: '始终深色' },
];

const COLOR_KEYS = [
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
];

const FIXED_LABELS: Record<string, string> = {
  version: '配置版本号',
  'site.url': '站点地址',
  'site.base': '站点 base 路径',
  'site.lang': '站点语言',
  'site.title': '站点标题',
  'site.description': '站点简介',
  'theme.id': '主题',
  'theme.palette': '主题配色',
  'theme.mode': '亮暗模式',
  'theme.hue': '色相',
  'theme.colors': '颜色覆盖',
  'theme.options': '主题自定义项',
  'theme.breakpoints': '响应式断点',
  'posts.pageSize': '每页篇数',
};

const session = useSession();

const state = ref<'loading' | 'ready' | 'legacy' | 'error'>('loading');
const errorText = ref('');
const saving = ref(false);
const rejected = ref<string[]>([]);
const rawConfig = ref<Record<string, unknown> | null>(null);
const manifest = ref<ThemeManifest | null>(null);
const configThemeId = ref('');
const savedSnapshot = ref('');
const loaded = ref(false);
const previewScheme = ref<SchemeName>('light');

const draft = reactive<Draft>({
  palette: null,
  mode: 'auto',
  hue: 250,
  colors: { light: {}, dark: {} },
  options: {},
  breakpoints: DEFAULT_BREAKPOINTS.map((bp) => ({ ...bp })),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? Math.round(value)
    : fallback;
}

function rejectLabel(field: string): string {
  if (FIXED_LABELS[field]) return FIXED_LABELS[field];
  const key = field.startsWith('theme.options.') ? field.slice('theme.options.'.length) : '';
  const def = manifest.value?.options.find((item) => item.key === key);
  return def ? `主题自定义项「${def.label}」` : field;
}

function normalizeColors(value: unknown): { light: Palette; dark: Palette } {
  const out: { light: Palette; dark: Palette } = { light: {}, dark: {} };
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

/** 按主题声明校验一个值，不合法回默认值（与模板 resolveOptions 同一规则）。 */
function optionValue(def: ThemeOptionDef, value: unknown): ThemeOptionValue {
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

function cloneValue(value: ThemeOptionValue): ThemeOptionValue {
  return Array.isArray(value) ? [...value] : value;
}

function sameValue(a: ThemeOptionValue | undefined, b: ThemeOptionValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
  }
  return a === b;
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
  return rows.length > 0
    ? rows.slice(0, MAX_BREAKPOINTS)
    : DEFAULT_BREAKPOINTS.map((bp) => ({ ...bp }));
}

/** 新旧两种 theme 结构都读成同一份草稿：新键优先，其次旧顶层键，最后是主题声明的默认值。 */
function normalize(config: Record<string, unknown>, theme: ThemeManifest): Draft {
  const raw = isRecord(config.theme) ? config.theme : {};
  const site = isRecord(config.site) ? config.site : {};
  const options = isRecord(raw.options) ? raw.options : {};
  const paletteId =
    typeof raw.palette === 'string' ? raw.palette : typeof raw.preset === 'string' ? raw.preset : '';
  const mode = raw.mode ?? raw.colorScheme;
  const resolved: Record<string, ThemeOptionValue> = {};
  for (const def of theme.options) {
    const legacy = def.key === 'announcement' ? site.announcement : raw[def.key];
    resolved[def.key] = cloneValue(optionValue(def, options[def.key] ?? legacy));
  }
  return {
    palette: theme.palettes.items.some((item) => item.id === paletteId) ? paletteId : null,
    mode: mode === 'light' || mode === 'dark' ? mode : 'auto',
    hue: pickNumber(raw.hue, 250, 0, 360),
    colors: normalizeColors(raw.colors),
    options: resolved,
    breakpoints: normalizeBreakpoints(raw.breakpoints),
  };
}

function copyDraft(target: Draft, source: Draft): void {
  target.palette = source.palette;
  target.mode = source.mode;
  target.hue = source.hue;
  target.colors = { light: { ...source.colors.light }, dark: { ...source.colors.dark } };
  target.options = Object.fromEntries(
    Object.entries(source.options).map(([key, value]) => [key, cloneValue(value)]),
  );
  target.breakpoints = source.breakpoints.map((bp) => ({ ...bp }));
}

function snapshotOf(value: Draft): string {
  const options = Object.keys(value.options)
    .sort()
    .map((key) => [key, value.options[key]]);
  return JSON.stringify({
    palette: value.palette,
    mode: value.mode,
    hue: value.hue,
    colors: value.colors,
    options,
    breakpoints: value.breakpoints.map((bp) => `${bp.id}:${bp.label}:${bp.maxWidth}`),
  });
}

const dirty = computed(() => loaded.value && snapshotOf(draft) !== savedSnapshot.value);

/* ---------- 主题 ---------- */

const themeMismatch = computed(
  () => Boolean(configThemeId.value) && configThemeId.value !== manifest.value?.id,
);

/* ---------- 主题配色 ---------- */

const palettes = computed<PaletteDef[]>(() => manifest.value?.palettes.items ?? []);
const activePalette = computed<PaletteDef | null>(
  () => palettes.value.find((item) => item.id === draft.palette) ?? null,
);

/** 没选配色时的 1.x 做法：整套颜色由色相派生（镜像 base.css 的 oklch 兜底公式）。 */
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
  };
}

function swatches(palette: { light: Palette; dark: Palette }): { light: string[]; dark: string[] } {
  const pick = (p: Palette): string[] => [p.bg ?? '', p.surface ?? '', p.accent ?? ''];
  return { light: pick(palette.light), dark: pick(palette.dark) };
}

const hueSwatches = computed(() =>
  swatches({ light: huePalette(draft.hue, 'light'), dark: huePalette(draft.hue, 'dark') }),
);

function choosePalette(id: string | null): void {
  draft.palette = id;
}

const hue = computed({
  get: () => draft.hue,
  set: (value: number) => {
    draft.hue = value;
  },
});

const mode = computed({
  get: () => draft.mode,
  set: (value: string | number) => {
    draft.mode = value === 'light' || value === 'dark' ? value : 'auto';
  },
});

const previewSchemeModel = computed({
  get: () => previewScheme.value,
  set: (value: string) => {
    previewScheme.value = value === 'dark' ? 'dark' : 'light';
  },
});

/** 右侧小样只演示配色：颜色是主题无关的，字体和尺寸由主题自己实现，保存后看站点预览。 */
const previewVars = computed<Record<string, string>>(() => {
  const scheme = previewScheme.value;
  const base = activePalette.value ? activePalette.value[scheme] : huePalette(draft.hue, scheme);
  const palette: Palette = { ...base, ...draft.colors[scheme] };
  return {
    '--pv-bg': palette.bg ?? '',
    '--pv-surface': palette.surface ?? '',
    '--pv-text': palette.text ?? '',
    '--pv-text-2': palette.text2 ?? '',
    '--pv-text-3': palette.text3 ?? '',
    '--pv-line': palette.line ?? '',
    '--pv-accent': palette.accent ?? '',
    '--pv-accent-ink': palette.accentInk ?? palette.accent ?? '',
    '--pv-accent-soft': palette.accentSoft ?? '',
    '--pv-on-accent': palette.onAccent ?? '',
  };
});

/* ---------- 主题自定义项 ---------- */

const optionGroups = computed(() => {
  const groups: { name: string; items: ThemeOptionDef[] }[] = [];
  for (const def of manifest.value?.options ?? []) {
    const name = def.group ?? '其他';
    const group = groups.find((item) => item.name === name);
    if (group) group.items.push(def);
    else groups.push({ name, items: [def] });
  }
  return groups;
});

function visible(def: ThemeOptionDef): boolean {
  return !def.when || draft.options[def.when.key] === def.when.value;
}

function textOf(key: string): string {
  const value = draft.options[key];
  return typeof value === 'string' ? value : '';
}

function boolOf(key: string): boolean {
  return draft.options[key] === true;
}

function setOption(key: string, value: ThemeOptionValue): void {
  draft.options[key] = value;
}

function selectItems(def: ThemeOptionDef): { value: string; label: string }[] {
  return def.choices ?? [];
}

function segmentItems(def: ThemeOptionDef): { key: string; label: string }[] {
  return (def.choices ?? []).map((choice) => ({ key: choice.value, label: choice.label }));
}

function checked(key: string, value: string): boolean {
  const current = draft.options[key];
  return Array.isArray(current) && current.includes(value);
}

/** 多选按声明顺序存，避免同样的选择因为点击顺序不同被当成改动。 */
function toggleCheck(def: ThemeOptionDef, value: string): void {
  const current = draft.options[def.key];
  const set = new Set(Array.isArray(current) ? current : []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  draft.options[def.key] = (def.choices ?? [])
    .map((choice) => choice.value)
    .filter((item) => set.has(item));
}

const customizedCount = computed(
  () =>
    (manifest.value?.options ?? []).filter((def) => !sameValue(draft.options[def.key], def.default))
      .length,
);

function resetOptions(): void {
  for (const def of manifest.value?.options ?? []) draft.options[def.key] = cloneValue(def.default);
}

/* ---------- 断点 ---------- */

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

/* ---------- 读写 ---------- */

function resetDraft(): void {
  if (!savedSnapshot.value || !manifest.value || !rawConfig.value) return;
  copyDraft(draft, normalize(rawConfig.value, manifest.value));
  rejected.value = [];
  session.setSaveState('saved');
}

/**
 * 组新的完整配置：只改 theme 段（以及迁走 site.announcement），其余字段原样保留。
 * 自定义项只写与主题默认值不同的那些，主题以后调整默认值时站点能跟着变。
 */
function buildConfig(): Record<string, unknown> | null {
  if (!rawConfig.value || !manifest.value) return null;
  const next: Record<string, unknown> = { ...rawConfig.value };
  const theme: Record<string, unknown> = isRecord(next.theme) ? { ...next.theme } : {};
  for (const key of LEGACY_THEME_KEYS) delete theme[key];
  theme.id = manifest.value.id;
  if (draft.palette) theme.palette = draft.palette;
  else delete theme.palette;
  theme.mode = draft.mode;
  theme.hue = draft.hue;
  if (Object.keys(draft.colors.light).length || Object.keys(draft.colors.dark).length) {
    theme.colors = { light: { ...draft.colors.light }, dark: { ...draft.colors.dark } };
  } else {
    delete theme.colors;
  }
  const options: Record<string, ThemeOptionValue> = {};
  for (const def of manifest.value.options) {
    const value = draft.options[def.key];
    if (value !== undefined && !sameValue(value, def.default)) options[def.key] = cloneValue(value);
  }
  theme.options = options;
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
  if (isRecord(next.site) && 'announcement' in next.site) {
    const site = { ...next.site };
    delete site.announcement;
    next.site = site;
  }
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
  loaded.value = false;
  const [configResult, themeResult] = await Promise.all([
    window.xiao.settings.read(session.siteDir),
    window.xiao.theme.read(session.siteDir),
  ]);
  session.setSaveState('saved');
  if (!configResult.ok) {
    state.value = 'error';
    errorText.value = configResult.message;
    return;
  }
  if (!themeResult.ok) {
    state.value = 'error';
    errorText.value = themeResult.message;
    return;
  }
  if (!themeResult.data) {
    state.value = 'legacy';
    return;
  }
  const config = isRecord(configResult.data) ? configResult.data : {};
  const theme = themeResult.data;
  rawConfig.value = config;
  manifest.value = theme;
  configThemeId.value =
    isRecord(config.theme) && typeof config.theme.id === 'string' ? config.theme.id : '';
  const normalized = normalize(config, theme);
  copyDraft(draft, normalized);
  lockedBpIds.value = normalized.breakpoints.map((bp) => bp.id);
  savedSnapshot.value = snapshotOf(normalized);
  previewScheme.value = normalized.mode === 'dark' ? 'dark' : 'light';
  loaded.value = true;
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
  // 写盘期间用户可能继续改；用开始写盘时的快照，避免把后续改动误标成已保存。
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
    const labels = result.data.map(rejectLabel).join('、');
    notify(`没有写入：${labels}。检查这些字段后重试。`, 'error', 'appearance-save');
    return;
  }
  rawConfig.value = next;
  configThemeId.value = manifest.value?.id ?? '';
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
  () => draft.mode,
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
      description="外观属于某个站点；打开站点后就能在这里选主题配色、调主题自定义项。"
      :icon="icons.appearance"
    />

    <div v-else-if="state === 'loading'" class="state" role="status">
      <UiSpinner :size="18" label="读取配置" />
      <span>正在读取站点配置和主题声明…</span>
    </div>

    <UiEmpty
      v-else-if="state === 'legacy'"
      title="这个站点的模板没有主题声明"
      description="站点里找不到 src/theme.json，说明它是用旧版模板建的，外观页没法知道它提供哪些配色和自定义项。新建的站点自带这个文件；旧站点可以从新模板复制 src/theme.json 和 src/lib/config.ts 过来。"
      :icon="icons.alert"
    >
      <template #action>
        <UiButton size="sm" @click="load">重新读取</UiButton>
      </template>
    </UiEmpty>

    <UiEmpty
      v-else-if="state === 'error'"
      title="读不到站点外观"
      :description="
        errorText
          ? `发生了什么：${errorText}。怎么办：检查站点里的 xiao.config.json 和 src/theme.json，或从欢迎页重新打开站点。`
          : '发生了什么：站点目录为空。怎么办：从欢迎页重新打开站点。'
      "
      :icon="icons.alert"
    >
      <template #action>
        <UiButton variant="primary" size="sm" @click="load">重试</UiButton>
      </template>
    </UiEmpty>

    <div v-else-if="manifest" class="appearance-body">
      <div class="appearance-main">
        <header class="page-head">
          <div class="page-titles">
            <h2>外观</h2>
            <p>
              主题决定站点的版式，主题配色只管颜色，主题自定义项是当前主题开放给你调的部分。保存后正在看的预览会按新配置重载。
            </p>
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
              <li v-for="field in rejected" :key="field">{{ rejectLabel(field) }}</li>
            </ul>
            <span>改好后再点保存；配置本身没有被改动。</span>
          </div>
        </div>

        <UiPanel title="主题">
          <div class="theme-card">
            <div class="theme-head">
              <strong class="theme-name">{{ manifest.name }}</strong>
              <UiBadge tone="accent">正在使用</UiBadge>
            </div>
            <p v-if="manifest.summary" class="theme-summary">{{ manifest.summary }}</p>
            <dl class="theme-meta">
              <dt>标识</dt>
              <dd>{{ manifest.id }}</dd>
              <dt>版本</dt>
              <dd>{{ manifest.version }}</dd>
              <template v-if="manifest.author">
                <dt>作者</dt>
                <dd>{{ manifest.author }}</dd>
              </template>
              <dt>提供</dt>
              <dd>{{ palettes.length }} 套配色 · {{ manifest.options.length }} 个自定义项</dd>
            </dl>
          </div>
          <p v-if="themeMismatch" class="section-lead warn-line">
            配置里记的主题是「{{ configThemeId }}」，但站点里装的是「{{ manifest.id }}」。保存后会改成当前装的主题。
          </p>
          <p class="section-lead">目前站点里只装了这一套主题。安装和切换其他主题之后会放在这里。</p>
        </UiPanel>

        <UiPanel title="主题配色">
          <template #actions>
            <UiBadge tone="neutral">{{ activePalette ? activePalette.name : '按色相生成' }}</UiBadge>
          </template>
          <p class="section-lead">配色只决定颜色，不会改动字体、字号或版式。下面这几套由「{{ manifest.name }}」主题提供。</p>
          <div class="token-grid mode-row">
            <UiField label="亮暗模式" hint="跟随系统时，访客仍可在站点右上角临时切换。">
              <UiSelect v-model="mode" :options="MODE_OPTIONS" />
            </UiField>
          </div>
          <div class="palette-grid">
            <button
              v-for="palette in palettes"
              :key="palette.id"
              type="button"
              class="palette-card"
              :class="{ 'is-active': draft.palette === palette.id }"
              :aria-pressed="draft.palette === palette.id"
              @click="choosePalette(palette.id)"
            >
              <span class="palette-head">
                <span class="palette-name">{{ palette.name }}</span>
                <UiIcon v-if="draft.palette === palette.id" :path="icons.check" :size="14" class="palette-check" />
              </span>
              <span v-if="palette.summary" class="palette-desc">{{ palette.summary }}</span>
              <span class="palette-swatches" aria-hidden="true">
                <span v-for="scheme in (['light', 'dark'] as const)" :key="scheme" class="swatch-row">
                  <span
                    v-for="(color, index) in swatches(palette)[scheme]"
                    :key="index"
                    class="swatch"
                    :style="{ background: color }"
                  />
                </span>
              </span>
            </button>
            <button
              type="button"
              class="palette-card"
              :class="{ 'is-active': !draft.palette }"
              :aria-pressed="!draft.palette"
              @click="choosePalette(null)"
            >
              <span class="palette-head">
                <span class="palette-name">按色相生成</span>
                <UiIcon v-if="!draft.palette" :path="icons.check" :size="14" class="palette-check" />
              </span>
              <span class="palette-desc">拖动色相，整套颜色跟着算出来。</span>
              <span class="palette-swatches" aria-hidden="true">
                <span v-for="scheme in (['light', 'dark'] as const)" :key="scheme" class="swatch-row">
                  <span
                    v-for="(color, index) in hueSwatches[scheme]"
                    :key="index"
                    class="swatch"
                    :style="{ background: color }"
                  />
                </span>
              </span>
            </button>
          </div>
          <div v-if="!draft.palette" class="token-grid hue-row">
            <UiField label="色相">
              <UiSlider v-model="hue" :min="0" :max="360" unit="°" />
            </UiField>
          </div>
        </UiPanel>

        <UiPanel :title="`主题自定义项 · ${manifest.name}`">
          <template #actions>
            <UiBadge v-if="customizedCount" tone="accent">已改 {{ customizedCount }} 项</UiBadge>
            <UiButton size="sm" variant="ghost" :disabled="!customizedCount" @click="resetOptions">
              全部恢复默认
            </UiButton>
          </template>
          <p class="section-lead">这些项由当前主题声明，换一个主题就会是另一组。</p>
          <section v-for="group in optionGroups" :key="group.name" class="option-group">
            <h3 class="option-group-title">{{ group.name }}</h3>
            <div class="token-grid">
              <template v-for="def in group.items" :key="def.key">
                <UiField
                  v-if="visible(def)"
                  :label="def.label"
                  :hint="def.hint"
                  :class="{ 'field-wide': def.type === 'textarea' || def.type === 'checks' }"
                >
                  <UiSelect
                    v-if="def.type === 'select'"
                    :model-value="textOf(def.key)"
                    :options="selectItems(def)"
                    @update:model-value="setOption(def.key, String($event))"
                  />
                  <UiSegmented
                    v-else-if="def.type === 'segmented'"
                    :model-value="textOf(def.key)"
                    :items="segmentItems(def)"
                    @update:model-value="setOption(def.key, $event)"
                  />
                  <div v-else-if="def.type === 'switch'" class="switch-row">
                    <UiSwitch :model-value="boolOf(def.key)" @update:model-value="setOption(def.key, $event)" />
                    <span>{{ boolOf(def.key) ? '开启' : '关闭' }}</span>
                  </div>
                  <UiTextarea
                    v-else-if="def.type === 'textarea'"
                    :model-value="textOf(def.key)"
                    :placeholder="def.placeholder"
                    :rows="3"
                    @update:model-value="setOption(def.key, $event)"
                  />
                  <div v-else-if="def.type === 'checks'" class="check-row" role="group" :aria-label="def.label">
                    <button
                      v-for="choice in def.choices ?? []"
                      :key="choice.value"
                      type="button"
                      class="check-chip"
                      :class="{ 'is-on': checked(def.key, choice.value) }"
                      :aria-pressed="checked(def.key, choice.value)"
                      @click="toggleCheck(def, choice.value)"
                    >
                      <UiIcon v-if="checked(def.key, choice.value)" :path="icons.check" :size="12" />
                      {{ choice.label }}
                    </button>
                  </div>
                  <UiInput
                    v-else
                    :model-value="textOf(def.key)"
                    :placeholder="def.placeholder"
                    @update:model-value="setOption(def.key, String($event))"
                  />
                </UiField>
              </template>
            </div>
          </section>
        </UiPanel>

        <UiPanel title="高级" collapsible :default-open="false">
          <h3 class="option-group-title">响应式断点</h3>
          <p class="section-lead">
            断点决定 HTML 文章里「平板 / 手机」这类样式在哪些宽度生效，不属于主题也不属于配色。默认：平板 ≤1023、手机 ≤767。
            标识会写进样式类名（如 <code>x-md-pad-lg</code>），已保存的标识不要改；删掉断点后，内容里它的旧类名会失效。
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

          <h3 class="option-group-title css-title">自定义 CSS</h3>
          <template v-if="session.mode === 'develop'">
            <p class="section-lead">
              站点自带 <code>src/styles/custom.css</code>，它在主题样式之后加载，可以覆盖任意
              <code>--color-*</code> / <code>--space-*</code> 变量，也可以写自己的选择器。
            </p>
            <UiButton size="sm" :icon-left="icons.code" @click="openCustomCss">在开发者抽屉打开 custom.css</UiButton>
          </template>
          <p v-else class="section-lead">
            切到开发者模式（Ctrl+Shift+D）后，这里会出现「打开 custom.css」的按钮；自定义样式保存在站点目录里，不写入配置。
          </p>
        </UiPanel>
      </div>

      <aside class="preview" aria-label="配色小样">
        <header class="preview-head">
          <div class="preview-title">
            <UiIcon :path="icons.preview" :size="15" />
            <strong>配色小样</strong>
          </div>
          <UiSegmented
            v-model="previewSchemeModel"
            :items="[
              { key: 'light', label: '浅色' },
              { key: 'dark', label: '深色' },
            ]"
          />
        </header>
        <p class="preview-note">只演示配色。字体、尺寸和版式由主题决定，保存后看站点预览。</p>

        <div class="preview-canvas" :style="previewVars">
          <div class="pv-topbar">
            <span class="pv-brand">晓</span>
            <span class="pv-nav">归档</span>
            <span class="pv-nav">标签</span>
          </div>
          <div class="pv-content">
            <h3 class="pv-title">一篇文章的标题</h3>
            <p class="pv-text">正文颜色、次要文字和分隔线都来自当前配色。</p>
            <p class="pv-meta">
              <span class="pv-category">分类</span>
              <span>3 分钟读完</span>
            </p>
            <div class="pv-actions">
              <span class="pv-button pv-button--primary">强调按钮</span>
              <span class="pv-button pv-button--ghost">次要按钮</span>
            </div>
            <article class="pv-card">
              <span class="pv-tag">#标签</span>
              <p class="pv-card-text">卡片底色、标签底色同样取自这套配色。</p>
            </article>
          </div>
        </div>
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
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
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
  max-width: 60ch;
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

.section-lead:last-child {
  margin-bottom: 0;
}

.section-lead code {
  padding: 1px 4px;
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.warn-line {
  color: var(--ui-warn, var(--ui-text));
}

.theme-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  margin-bottom: var(--ui-s3);
  padding: var(--ui-s3) var(--ui-s4);
  border: 1px solid var(--ui-accent);
  border-radius: var(--ui-r);
  background: var(--ui-accent-weak);
}

.theme-head {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.theme-name {
  font-size: var(--ui-fs-4);
  font-weight: 600;
}

.theme-summary {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.theme-meta {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px var(--ui-s3);
  margin: 0;
  font-size: var(--ui-fs-1);
}

.theme-meta dt {
  color: var(--ui-text-3);
}

.theme-meta dd {
  margin: 0;
  color: var(--ui-text-2);
}

.mode-row {
  margin-bottom: var(--ui-s3);
}

.hue-row {
  margin-top: var(--ui-s3);
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--ui-s2);
}

.palette-card {
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

.palette-card:hover {
  border-color: var(--ui-line-2);
  background: var(--ui-hover);
}

.palette-card.is-active {
  border-color: var(--ui-accent);
  background: var(--ui-accent-weak);
}

.palette-card:focus-visible,
.check-chip:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.palette-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
}

.palette-name {
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.palette-check {
  color: var(--ui-accent);
}

.palette-desc {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.palette-swatches {
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

.option-group + .option-group {
  margin-top: var(--ui-s4);
  padding-top: var(--ui-s4);
  border-top: 1px solid var(--ui-line);
}

.option-group-title {
  margin: 0 0 var(--ui-s3);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.css-title {
  margin-top: var(--ui-s5);
  padding-top: var(--ui-s4);
  border-top: 1px solid var(--ui-line);
}

.token-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--ui-s3) var(--ui-s4);
}

.field-wide {
  grid-column: 1 / -1;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: var(--ui-h-md);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.check-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s2);
}

.check-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: var(--ui-h-sm, 28px);
  padding: 0 var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: 999px;
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  cursor: pointer;
  transition:
    border-color var(--ui-dur) var(--ui-ease),
    background var(--ui-dur) var(--ui-ease),
    color var(--ui-dur) var(--ui-ease);
}

.check-chip:hover {
  border-color: var(--ui-line-2);
}

.check-chip.is-on {
  border-color: var(--ui-accent);
  background: var(--ui-accent-weak);
  color: var(--ui-text);
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
  line-height: var(--ui-lh);
}

.preview-canvas {
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--pv-bg);
  color: var(--pv-text);
  font-size: 13px;
  line-height: 1.7;
}

.pv-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px;
  min-height: 38px;
  border-bottom: 1px solid var(--pv-line);
  color: var(--pv-text-2);
  font-size: 12px;
}

.pv-brand {
  margin-right: auto;
  color: var(--pv-text);
  font-size: 15px;
  font-weight: 700;
}

.pv-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 14px 18px;
}

.pv-title {
  margin: 0;
  color: var(--pv-text);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
}

.pv-text {
  margin: 0;
  color: var(--pv-text-2);
}

.pv-meta {
  display: flex;
  gap: 12px;
  margin: 0;
  color: var(--pv-text-3);
  font-size: 12px;
}

.pv-category {
  color: var(--pv-accent-ink);
  font-weight: 600;
}

.pv-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pv-button {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
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
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: var(--pv-surface);
}

.pv-tag {
  align-self: flex-start;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--pv-accent-soft);
  color: var(--pv-accent-ink);
  font-size: 11px;
}

.pv-card-text {
  margin: 0;
  color: var(--pv-text-2);
  font-size: 12px;
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
