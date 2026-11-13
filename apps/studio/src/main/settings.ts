import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

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
    hue: number;
    font: string;
    contentWidth: string;
    radius: string;
    colorScheme: string;
    preset?: string;
    scale?: string;
    lineHeight?: string;
    density?: string;
    shadow?: string;
    motion?: boolean;
    fontStack?: string;
    headingWeight?: number;
    colors?: {
      light?: Record<string, string>;
      dark?: Record<string, string>;
    };
    breakpoints?: { id: string; label: string; maxWidth: number }[];
  };
  seo: { titleTemplate: string; twitter: string; noindex: boolean };
  posts: { pageSize: number; license: { enabled: boolean; name: string; url: string } };
  nav: { label: string; href: string }[];
  redirects: Record<string, string>;
}

const PRESET_IDS = ['midnight', 'paper', 'magazine', 'terminal', 'warm', 'minimal'] as const;
const COLOR_SCHEMES = ['auto', 'light', 'dark'] as const;
const FONTS = ['sans', 'serif', 'mono', 'custom', 'mono-heading'] as const;
const SCALES = ['compact', 'normal', 'spacious'] as const;
const LINE_HEIGHTS = ['tight', 'normal', 'loose'] as const;
const DENSITIES = ['compact', 'normal'] as const;
const RADII = ['none', 'sm', 'md', 'lg', 'pill'] as const;
const CONTENT_WIDTHS = ['narrow', 'prose', 'wide', 'full'] as const;
const SHADOWS = ['none', 'soft', 'strong'] as const;
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

export function configErrors(config: SiteConfig): string[] {
  const errors: string[] = [];
  if (typeof config.version !== 'number') errors.push('version');
  for (const key of ['url', 'base', 'lang', 'title', 'description'] as const) {
    if (!config.site?.[key]?.trim()) errors.push(`site.${key}`);
  }
  const theme = config.theme;
  if (typeof theme?.hue !== 'number' || theme.hue < 0 || theme.hue > 360) errors.push('theme.hue');
  if (theme?.preset !== undefined && !oneOf(theme.preset, PRESET_IDS)) errors.push('theme.preset');
  if (theme?.colorScheme !== undefined && !oneOf(theme.colorScheme, COLOR_SCHEMES)) {
    errors.push('theme.colorScheme');
  }
  if (theme?.font !== undefined && !oneOf(theme.font, FONTS)) errors.push('theme.font');
  if (theme?.scale !== undefined && !oneOf(theme.scale, SCALES)) errors.push('theme.scale');
  if (theme?.lineHeight !== undefined && !oneOf(theme.lineHeight, LINE_HEIGHTS)) {
    errors.push('theme.lineHeight');
  }
  if (theme?.density !== undefined && !oneOf(theme.density, DENSITIES))
    errors.push('theme.density');
  if (theme?.radius !== undefined && !oneOf(theme.radius, RADII)) errors.push('theme.radius');
  if (theme?.contentWidth !== undefined && !oneOf(theme.contentWidth, CONTENT_WIDTHS)) {
    errors.push('theme.contentWidth');
  }
  if (theme?.shadow !== undefined && !oneOf(theme.shadow, SHADOWS)) errors.push('theme.shadow');
  if (theme?.motion !== undefined && typeof theme.motion !== 'boolean') errors.push('theme.motion');
  if (theme?.fontStack !== undefined && typeof theme.fontStack !== 'string') {
    errors.push('theme.fontStack');
  }
  if (
    theme?.headingWeight !== undefined &&
    (!Number.isInteger(theme.headingWeight) ||
      theme.headingWeight < 100 ||
      theme.headingWeight > 900)
  ) {
    errors.push('theme.headingWeight');
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
  return errors;
}

export function readConfig(siteDir: string): SiteConfig {
  return JSON.parse(readFileSync(path.join(siteDir, 'xiao.config.json'), 'utf8')) as SiteConfig;
}

export function writeConfig(siteDir: string, config: SiteConfig): string[] {
  const errors = configErrors(config);
  if (errors.length > 0) return errors;
  writeFileSync(path.join(siteDir, 'xiao.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  return [];
}
