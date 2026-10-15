import raw from '../../xiao.config.json';

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
    since: number;
  };
  author: { name: string; avatar: string; bio: string; email: string };
  social: { name: string; icon: string; url: string }[];
  nav: { label: string; href: string }[];
  theme: {
    hue: number;
    font: 'sans' | 'serif' | 'mono-heading';
    contentWidth: 'narrow' | 'prose' | 'wide';
    radius: 'none' | 'sm' | 'md' | 'lg';
    colorScheme: 'auto' | 'light' | 'dark';
  };
  seo: { titleTemplate: string; twitter: string; noindex: boolean };
  posts: { pageSize: number; license: { enabled: boolean; name: string; url: string } };
  redirects: Record<string, string>;
}

export function loadConfig(): XiaoConfig {
  return raw as XiaoConfig;
}

export function titleOf(pageTitle: string | undefined, config = loadConfig()): string {
  if (!pageTitle || pageTitle === config.site.title) return config.site.title;
  return config.seo.titleTemplate.replace('%s', pageTitle);
}
