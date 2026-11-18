import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type OptionValue = string | boolean | string[];

/**
 * xiao.config.json。theme 段按 D-99 分三层：主题（id）/ 主题配色（palette + mode + hue + colors）/
 * 主题自定义项（options）。旧键 preset / colorScheme / font / scale … 仍允许出现（旧站点），
 * 外观页保存时迁移到新键。
 */
export interface SiteConfig {
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
    heroImage?: string;
    since: number;
  };
  author: { name: string; avatar: string; bio: string; email: string };
  theme: {
    id?: string;
    palette?: string;
    mode?: string;
    hue: number;
    colors?: {
      light?: Record<string, string>;
      dark?: Record<string, string>;
    };
    options?: Record<string, OptionValue>;
    breakpoints?: { id: string; label: string; maxWidth: number }[];
    [legacy: string]: unknown;
  };
  seo: { titleTemplate: string; twitter: string; noindex: boolean };
  posts: { pageSize: number; license: { enabled: boolean; name: string; url: string } };
  nav: { label: string; href: string }[];
  redirects: Record<string, string>;
}

/** 站点 src/theme.json：主题自己声明的信息、配色和自定义项。模板与 Studio 共读这一份。 */
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  summary?: string;
  palettes: {
    default: string;
    items: {
      id: string;
      name: string;
      summary?: string;
      light: Record<string, string>;
      dark: Record<string, string>;
    }[];
  };
  options: {
    key: string;
    group?: string;
    label: string;
    hint?: string;
    placeholder?: string;
    type: 'select' | 'segmented' | 'switch' | 'text' | 'textarea' | 'checks';
    default: OptionValue;
    choices?: { value: string; label: string }[];
    when?: { key: string; value: string };
  }[];
}

const MODES = ['auto', 'light', 'dark'] as const;
const OPTION_TYPES = ['select', 'segmented', 'switch', 'text', 'textarea', 'checks'] as const;
/** 旧版写在 theme 顶层的排版键，取值范围仍按旧规则校验。 */
const LEGACY_ENUMS: Record<string, readonly string[]> = {
  font: ['sans', 'serif', 'mono', 'custom', 'mono-heading'],
  scale: ['compact', 'normal', 'spacious'],
  lineHeight: ['tight', 'normal', 'loose'],
  density: ['compact', 'normal'],
  radius: ['none', 'sm', 'md', 'lg', 'pill'],
  contentWidth: ['narrow', 'prose', 'wide', 'full'],
  shadow: ['none', 'soft', 'strong'],
};
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
] as const;

function oneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function paletteErrors(palette: unknown, label: string, errors: string[]): void {
  if (!palette || typeof palette !== 'object') {
    errors.push(label);
    return;
  }
  for (const [key, value] of Object.entries(palette)) {
    if (
      !(COLOR_KEYS as readonly string[]).includes(key) ||
      typeof value !== 'string' ||
      !value.trim()
    ) {
      errors.push(label);
      return;
    }
  }
}

/** 按主题声明校验自定义项：只认声明过的键，取值要符合声明的类型和可选项。 */
function optionErrors(
  options: Record<string, unknown>,
  manifest: ThemeManifest,
  errors: string[],
): void {
  for (const [key, value] of Object.entries(options)) {
    const def = manifest.options.find((item) => item.key === key);
    const label = `theme.options.${key}`;
    if (!def) {
      errors.push(label);
      continue;
    }
    const allowed = def.choices?.map((choice) => choice.value);
    const valid =
      def.type === 'switch'
        ? typeof value === 'boolean'
        : def.type === 'checks'
          ? Array.isArray(value) &&
            value.every((item) => typeof item === 'string' && (!allowed || allowed.includes(item)))
          : def.type === 'select' || def.type === 'segmented'
            ? typeof value === 'string' && (!allowed || allowed.includes(value))
            : typeof value === 'string';
    if (!valid) errors.push(label);
  }
}

export function configErrors(config: SiteConfig, manifest: ThemeManifest | null = null): string[] {
  const errors: string[] = [];
  if (typeof config.version !== 'number') errors.push('version');
  for (const key of ['url', 'base', 'lang', 'title', 'description'] as const) {
    if (!config.site?.[key]?.trim()) errors.push(`site.${key}`);
  }
  const theme = config.theme;
  if (typeof theme?.hue !== 'number' || theme.hue < 0 || theme.hue > 360) errors.push('theme.hue');
  if (theme?.id !== undefined && (typeof theme.id !== 'string' || !theme.id.trim())) {
    errors.push('theme.id');
  }
  const paletteIds = manifest?.palettes.items.map((item) => item.id);
  for (const key of ['palette', 'preset'] as const) {
    const value = theme?.[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || (paletteIds && !paletteIds.includes(value))) {
      errors.push(`theme.${key}`);
    }
  }
  for (const key of ['mode', 'colorScheme'] as const) {
    if (theme?.[key] !== undefined && !oneOf(theme[key], MODES)) errors.push(`theme.${key}`);
  }
  if (theme?.options !== undefined) {
    if (!isRecord(theme.options)) errors.push('theme.options');
    else if (manifest) optionErrors(theme.options, manifest, errors);
  }
  for (const [key, allowed] of Object.entries(LEGACY_ENUMS)) {
    if (theme?.[key] !== undefined && !oneOf(theme[key], allowed)) errors.push(`theme.${key}`);
  }
  if (theme?.motion !== undefined && typeof theme.motion !== 'boolean') errors.push('theme.motion');
  if (theme?.fontStack !== undefined && typeof theme.fontStack !== 'string') {
    errors.push('theme.fontStack');
  }
  if (theme?.colors !== undefined) {
    if (!theme.colors || typeof theme.colors !== 'object') errors.push('theme.colors');
    else {
      if (theme.colors.light !== undefined)
        paletteErrors(theme.colors.light, 'theme.colors', errors);
      if (theme.colors.dark !== undefined) paletteErrors(theme.colors.dark, 'theme.colors', errors);
    }
  }
  if (theme?.breakpoints !== undefined) {
    if (!Array.isArray(theme.breakpoints)) errors.push('theme.breakpoints');
    else {
      for (const item of theme.breakpoints) {
        if (!item || typeof item.id !== 'string' || !item.id.trim())
          errors.push('theme.breakpoints');
        else if (typeof item.label !== 'string') errors.push('theme.breakpoints');
        else if (typeof item.maxWidth !== 'number' || item.maxWidth < 1)
          errors.push('theme.breakpoints');
      }
    }
  }
  if (!Number.isInteger(config.posts?.pageSize) || config.posts.pageSize < 1)
    errors.push('posts.pageSize');
  return [...new Set(errors)];
}

export function readConfig(siteDir: string): SiteConfig {
  return JSON.parse(readFileSync(path.join(siteDir, 'xiao.config.json'), 'utf8')) as SiteConfig;
}

export function manifestPath(siteDir: string): string {
  return path.join(siteDir, 'src', 'theme.json');
}

/**
 * 读主题声明。没有这个文件说明站点是 D-99 之前建的旧模板，返回 null，由调用方决定怎么提示；
 * 文件存在但结构不对则抛出可读错误。
 */
export function readManifest(siteDir: string): ThemeManifest | null {
  const file = manifestPath(siteDir);
  if (!existsSync(file)) return null;
  const data = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const problem = manifestProblem(data);
  if (problem) throw new Error(`主题声明文件 src/theme.json 不完整：${problem}`);
  return data as ThemeManifest;
}

function manifestProblem(data: unknown): string | null {
  if (!isRecord(data)) return '不是一个 JSON 对象';
  if (typeof data.id !== 'string' || !data.id.trim()) return '缺少 id';
  if (typeof data.name !== 'string' || !data.name.trim()) return '缺少 name';
  const palettes = data.palettes;
  if (!isRecord(palettes) || !Array.isArray(palettes.items) || palettes.items.length === 0) {
    return 'palettes.items 至少要有一套配色';
  }
  for (const item of palettes.items) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
      return '每套配色都要有 id 和 name';
    }
    if (!isRecord(item.light) || !isRecord(item.dark)) return `配色 ${item.id} 缺少 light 或 dark`;
  }
  if (!Array.isArray(data.options)) return 'options 必须是数组';
  for (const option of data.options) {
    if (!isRecord(option) || typeof option.key !== 'string' || typeof option.label !== 'string') {
      return '每个自定义项都要有 key 和 label';
    }
    if (!oneOf(option.type, OPTION_TYPES)) return `自定义项 ${option.key} 的 type 不认识`;
  }
  return null;
}

export interface SettingsPatch {
  /** 点路径写入，例如 `site.url`、`theme`。 */
  set?: Record<string, unknown>;
  /** 点路径删除，例如 `site.announcement`。 */
  unset?: string[];
}

function applyPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index] ?? '';
    const next = cursor[key];
    if (!isRecord(next)) {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
      continue;
    }
    cursor = next;
  }
  cursor[parts[parts.length - 1] ?? ''] = value;
}

function removePath(target: Record<string, unknown>, path: string): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const next = cursor[parts[index] ?? ''];
    if (!isRecord(next)) return;
    cursor = next;
  }
  delete cursor[parts[parts.length - 1] ?? ''];
}

/** 写盘前重新读磁盘上的最新配置，只改调用方给出的路径。 */
export function patchConfig(siteDir: string, patch: SettingsPatch): string[] {
  const file = path.join(siteDir, 'xiao.config.json');
  const current = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch.set ?? {})) applyPath(current, key, value);
  for (const key of patch.unset ?? []) removePath(current, key);
  return writeConfig(siteDir, current as SiteConfig);
}

export function writeConfig(siteDir: string, config: SiteConfig): string[] {
  const errors = configErrors(config, readManifest(siteDir));
  if (errors.length > 0) return errors;
  writeFileSync(path.join(siteDir, 'xiao.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  return [];
}
