import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  SHARED_LAYOUTS,
  isHiddenStudioPage,
  isValidSlug,
  normalizePageFile,
} from '@xiao/core/site';
import { listPosts } from './content.ts';

/** 页面列表含站点页与共用容器，不含单篇文章版式。 */

export type PageTemplate = 'blank' | 'landing' | 'about';

const templates: Record<PageTemplate, string> = {
  blank: [
    '---',
    "import PageLayout from '../layouts/PageLayout.astro';",
    '---',
    '<PageLayout title="新页面">',
    '</PageLayout>',
    '',
  ].join('\n'),
  landing: [
    '---',
    "import PageLayout from '../layouts/PageLayout.astro';",
    "import Section from '../components/xiao/Section.astro';",
    "import Text from '../components/xiao/Text.astro';",
    '---',
    '<PageLayout title="落地页" showHeading={false}>',
    '  <Section>',
    '    <Text>欢迎</Text>',
    '  </Section>',
    '</PageLayout>',
    '',
  ].join('\n'),
  about: [
    '---',
    "import PageLayout from '../layouts/PageLayout.astro';",
    "import { loadConfig } from '../lib/config';",
    'const config = loadConfig();',
    '---',
    '<PageLayout title="关于">',
    '  <p>{config.author.bio}</p>',
    '</PageLayout>',
    '',
  ].join('\n'),
};

function pagesRoot(siteDir: string): string {
  return path.join(siteDir, 'src', 'pages');
}

export function listPages(siteDir: string): string[] {
  const root = pagesRoot(siteDir);
  const found: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (name.startsWith('_')) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (name.endsWith('.astro'))
        found.push(path.relative(siteDir, full).split(path.sep).join('/'));
    }
  };
  walk(root);
  for (const file of SHARED_LAYOUTS) {
    if (existsSync(path.join(siteDir, file))) found.push(file);
  }
  return [...new Set(found.map(normalizePageFile))]
    .filter((file) => !isHiddenStudioPage(file))
    .sort();
}

export function pageHref(siteDir: string, file: string): string {
  const normalized = file.replaceAll('\\', '/');
  if (
    normalized === 'src/pages/posts/[...slug].astro' ||
    normalized === 'src/layouts/PostLayout.astro'
  ) {
    const post = listPosts(siteDir).find((item) => !item.draft);
    return post ? `posts/${post.slug}/` : '';
  }
  if (normalized === 'src/layouts/PageLayout.astro') {
    return existsSync(path.join(siteDir, 'src/pages/about.astro')) ? 'about/' : '';
  }
  if (normalized === 'src/pages/categories/[category].astro') {
    const category = listPosts(siteDir).find((item) => item.category)?.category;
    return category ? `categories/${encodeURIComponent(category)}/` : 'categories/';
  }
  if (normalized === 'src/pages/tags/[tag].astro') {
    const tag = listPosts(siteDir).flatMap((item) => item.tags)[0];
    return tag ? `tags/${encodeURIComponent(tag)}/` : 'tags/';
  }
  let route = normalized.replace(/^src\/pages\//, '').replace(/\.astro$/, '');
  if (route === 'index') return '';
  if (route.endsWith('/index')) route = route.slice(0, -'/index'.length);
  if (route.includes('[')) return '';
  return `${route}/`;
}

export function createPage(siteDir: string, template: PageTemplate, slug: string): string {
  if (!isValidSlug(slug)) throw new Error('slug 只允许小写字母、数字和连字符');
  const body = templates[template];
  if (!body) throw new Error('没有这个页面模板');
  const relative = `src/pages/${slug}.astro`;
  const dest = path.join(siteDir, relative);
  if (existsSync(dest)) throw new Error('页面已存在');
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  return relative;
}
