import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  SHARED_LAYOUTS,
  SITE_PARTS,
  isHiddenStudioPage,
  isValidSlug,
  normalizePageFile,
} from '@xiao/core/site';
import { listPosts } from './content.ts';

/** 页面列表含站点页与共用容器，不含单篇文章版式。 */

export type PageTemplate = 'blank' | 'docs' | 'landing' | 'magazine' | 'about';

const templates: Record<PageTemplate, string> = {
  blank: [
    '---',
    "import PageLayout from '../layouts/PageLayout.astro';",
    '---',
    '<PageLayout title="新页面">',
    '</PageLayout>',
    '',
  ].join(String.fromCharCode(10)),
  docs: [
    '---',
    "import PageLayout from '../layouts/PageLayout.astro';",
    "import Heading from '../components/xiao/Heading.astro';",
    "import Text from '../components/xiao/Text.astro';",
    '---',
    '<PageLayout title="文档" sidebar="left">',
    '  <Heading level={2}>小节标题</Heading>',
    '  <Text>从这里开始写文档内容。</Text>',
    '</PageLayout>',
    '',
  ].join(String.fromCharCode(10)),
  landing: [
    '---',
    "import PageLayout from '../layouts/PageLayout.astro';",
    "import CtaBand from '../components/xiao/CtaBand.astro';",
    "import FeatureGrid from '../components/xiao/FeatureGrid.astro';",
    "import Hero from '../components/xiao/Hero.astro';",
    "import Split from '../components/xiao/Split.astro';",
    "import Button from '../components/xiao/Button.astro';",
    "import Card from '../components/xiao/Card.astro';",
    "import Column from '../components/xiao/Column.astro';",
    "import Heading from '../components/xiao/Heading.astro';",
    "import Text from '../components/xiao/Text.astro';",
    '---',
    '<PageLayout title="落地页" showHeading={false} sidebar="none">',
    '  <Hero>',
    '    <Heading level={1}>让想法直接上线</Heading>',
    '    <Text>一句话说明这个站点解决什么问题。</Text>',
    '    <Button href="#">开始</Button>',
    '  </Hero>',
    '  <Split>',
    '    <Column>',
    '      <Heading level={2}>左栏标题</Heading>',
    '      <Text>左栏内容。</Text>',
    '    </Column>',
    '    <Column>',
    '      <Heading level={2}>右栏标题</Heading>',
    '      <Text>右栏内容。</Text>',
    '    </Column>',
    '  </Split>',
    '  <FeatureGrid cols="3">',
    '    <Card>',
    '      <Heading level={3}>特性一</Heading>',
    '      <Text>说明。</Text>',
    '    </Card>',
    '    <Card>',
    '      <Heading level={3}>特性二</Heading>',
    '      <Text>说明。</Text>',
    '    </Card>',
    '    <Card>',
    '      <Heading level={3}>特性三</Heading>',
    '      <Text>说明。</Text>',
    '    </Card>',
    '  </FeatureGrid>',
    '  <CtaBand>',
    '    <Heading level={2}>准备好了吗？</Heading>',
    '    <Text>一句行动说明。</Text>',
    '    <Button href="#">立即开始</Button>',
    '  </CtaBand>',
    '</PageLayout>',
    '',
  ].join(String.fromCharCode(10)),
  magazine: [
    '---',
    "import PageLayout from '../layouts/PageLayout.astro';",
    "import FeatureGrid from '../components/xiao/FeatureGrid.astro';",
    "import Hero from '../components/xiao/Hero.astro';",
    "import QuoteBand from '../components/xiao/QuoteBand.astro';",
    "import Card from '../components/xiao/Card.astro';",
    "import Heading from '../components/xiao/Heading.astro';",
    "import Quote from '../components/xiao/Quote.astro';",
    "import Text from '../components/xiao/Text.astro';",
    '---',
    '<PageLayout title="杂志" showHeading={false} sidebar="none">',
    '  <Hero>',
    '    <Heading level={1}>本期主题</Heading>',
    '    <Text>用一段话介绍这组内容。</Text>',
    '  </Hero>',
    '  <FeatureGrid cols="3">',
    '    <Card><Text>第一条要目</Text></Card>',
    '    <Card><Text>第二条要目</Text></Card>',
    '    <Card><Text>第三条要目</Text></Card>',
    '  </FeatureGrid>',
    '  <QuoteBand>',
    '    <Quote>一句值得单独展示的话。</Quote>',
    '  </QuoteBand>',
    '</PageLayout>',
    '',
  ].join(String.fromCharCode(10)),
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
  ].join(String.fromCharCode(10)),
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
  for (const file of [...SHARED_LAYOUTS, ...SITE_PARTS]) {
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
  if ((SITE_PARTS as readonly string[]).includes(normalized)) {
    return '';
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
