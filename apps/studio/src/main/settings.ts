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
    since: number;
  };
  author: { name: string; avatar: string; bio: string; email: string };
  theme: {
    hue: number;
    font: string;
    contentWidth: string;
    radius: string;
    colorScheme: string;
  };
  seo: { titleTemplate: string; twitter: string; noindex: boolean };
  posts: { pageSize: number; license: { enabled: boolean; name: string; url: string } };
  nav: { label: string; href: string }[];
  redirects: Record<string, string>;
}

export function configErrors(config: SiteConfig): string[] {
  const errors: string[] = [];
  if (typeof config.version !== 'number') errors.push('version');
  for (const key of ['url', 'base', 'lang', 'title', 'description'] as const) {
    if (!config.site?.[key]?.trim()) errors.push(`site.${key}`);
  }
  if (typeof config.theme?.hue !== 'number' || config.theme.hue < 0 || config.theme.hue > 360) {
    errors.push('theme.hue');
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
