/**
 * Studio「页面」导航的分类。
 *
 * - 站点页面：首页、关于、用户自建页，只影响这一页。
 * - 系统容器：默认版式、动态路由、归档/搜索/404，改动会作用到多篇文章或整站。
 * - 单篇文章版式（src/layouts/posts/<slug>.astro）不属于「页面」，归「文章」的版式层。
 * - 组件文档页（src/pages/xiao/）对写作用户隐藏。
 */

export type PageGroup = 'site' | 'system';

export const SHARED_LAYOUTS = [
  'src/layouts/PostLayout.astro',
  'src/layouts/PageLayout.astro',
] as const;

const SITE_PAGE_LABELS: Record<string, string> = {
  'src/pages/index.astro': '首页',
  'src/pages/about.astro': '关于',
};

const SHARED_LAYOUT_LABELS: Record<string, string> = {
  'src/layouts/PostLayout.astro': '默认文章版式',
  'src/layouts/PageLayout.astro': '默认页面版式',
};

const SYSTEM_PAGE_LABELS: Record<string, string> = {
  'src/pages/posts/[...slug].astro': '文章路由容器',
  'src/pages/categories/index.astro': '分类列表',
  'src/pages/categories/[category].astro': '分类页容器',
  'src/pages/tags/index.astro': '标签列表',
  'src/pages/tags/[tag].astro': '标签页容器',
  'src/pages/archives.astro': '归档',
  'src/pages/search.astro': '搜索',
  'src/pages/404.astro': '404',
};

export function normalizePageFile(file: string): string {
  return file.replaceAll('\\', '/');
}

export function isHiddenStudioPage(file: string): boolean {
  return normalizePageFile(file).startsWith('src/pages/xiao/');
}

export function isSharedLayout(file: string): boolean {
  const normalized = normalizePageFile(file);
  return (
    normalized === 'src/layouts/PostLayout.astro' || normalized === 'src/layouts/PageLayout.astro'
  );
}

export function isArticleLayout(file: string): boolean {
  return /^src\/layouts\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\.astro$/.test(normalizePageFile(file));
}

export function isHtmlPostFile(file: string): boolean {
  return /^src\/content\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*\/index\.html$/.test(
    normalizePageFile(file),
  );
}

export function htmlPostSlugOf(file: string): string {
  const match = /^src\/content\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.html$/.exec(
    normalizePageFile(file),
  );
  return match?.[1] ?? '';
}

export function htmlPostFileOf(slug: string): string {
  return `src/content/posts/${slug}/index.html`;
}

export function isSystemPage(file: string): boolean {
  const normalized = normalizePageFile(file);
  if (isSharedLayout(normalized)) return true;
  if (SYSTEM_PAGE_LABELS[normalized]) return true;
  return normalized.startsWith('src/pages/') && normalized.includes('[');
}

export function pageGroup(file: string): PageGroup {
  return isSystemPage(file) ? 'system' : 'site';
}

export function pageLabel(file: string): string {
  const normalized = normalizePageFile(file);
  const shared = SHARED_LAYOUT_LABELS[normalized];
  if (shared) return shared;
  const system = SYSTEM_PAGE_LABELS[normalized];
  if (system) return system;
  const site = SITE_PAGE_LABELS[normalized];
  if (site) return site;
  const article = /^src\/layouts\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.astro$/.exec(normalized);
  if (article?.[1]) return `文章版式 · ${article[1]}`;
  const base = normalized.replace(/^src\/pages\//, '').replace(/\.astro$/, '');
  return base.endsWith('/index') ? base.slice(0, -6) : base;
}

/** 出现在「页面」列表里的文件：站点页 + 系统容器 + 共用版式。 */
export function isStudioPageFile(file: string): boolean {
  const normalized = normalizePageFile(file);
  if (isHiddenStudioPage(normalized) || isArticleLayout(normalized)) return false;
  if (isSharedLayout(normalized)) return true;
  return /^src\/pages\/[\w./[\]-]+\.astro$/.test(normalized);
}

export function groupStudioPages(files: string[]): { site: string[]; system: string[] } {
  const site: string[] = [];
  const system: string[] = [];
  for (const file of files) {
    const normalized = normalizePageFile(file);
    if (!isStudioPageFile(normalized)) continue;
    if (pageGroup(normalized) === 'system') system.push(normalized);
    else site.push(normalized);
  }
  const rank = (file: string): number => {
    if (file === 'src/pages/index.astro' || file === 'src/layouts/PostLayout.astro') return 0;
    if (file === 'src/pages/about.astro' || file === 'src/layouts/PageLayout.astro') return 1;
    return 10;
  };
  const byName = (left: string, right: string) =>
    rank(left) - rank(right) || left.localeCompare(right);
  site.sort(byName);
  system.sort(byName);
  return { site, system };
}
