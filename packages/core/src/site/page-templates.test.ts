import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOutline, safePage } from '../../../../apps/studio/src/main/canvas.ts';
import { customizePost } from '../../../../apps/studio/src/main/content.ts';
import { createPage, listPages } from '../../../../apps/studio/src/main/pages.ts';

describe('自定义此页和页面模板', () => {
  it('自定义只复制当前文章的布局', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'xiao-page-'));
    const layout = path.join(site, 'src', 'layouts');
    mkdirSync(layout, { recursive: true });
    writeFileSync(
      path.join(layout, 'PostLayout.astro'),
      "import Base from './BaseLayout.astro';\nimport { loadConfig } from '../lib/config';\n<slot />\n",
    );
    const custom = customizePost(site, 'only-this');
    expect(readFileSync(path.join(site, custom), 'utf8')).toBe(
      "import Base from '../BaseLayout.astro';\nimport { loadConfig } from '../../lib/config';\n<slot />\n",
    );
    expect(readFileSync(path.join(layout, 'PostLayout.astro'), 'utf8')).toContain(
      './BaseLayout.astro',
    );
    expect(existsSync(path.join(site, 'src', 'layouts', 'posts', 'other.astro'))).toBe(false);
  });

  it('页面模板各自成页，不改首页', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'xiao-page-'));
    const index = path.join(site, 'src', 'pages', 'index.astro');
    mkdirSync(path.dirname(index), { recursive: true });
    writeFileSync(index, 'HOME\n');
    expect(createPage(site, 'blank', 'empty')).toBe('src/pages/empty.astro');
    expect(createPage(site, 'docs', 'guide')).toContain('guide.astro');
    expect(createPage(site, 'landing', 'land')).toContain('land.astro');
    expect(createPage(site, 'magazine', 'zine')).toContain('zine.astro');
    expect(createPage(site, 'about', 'about-me')).toContain('about-me.astro');
    expect(readFileSync(index, 'utf8')).toBe('HOME\n');
    expect(readFileSync(path.join(site, 'src/pages/guide.astro'), 'utf8')).toContain('<Heading');
    expect(readFileSync(path.join(site, 'src/pages/land.astro'), 'utf8')).toContain('<Hero>');
    expect(readFileSync(path.join(site, 'src/pages/zine.astro'), 'utf8')).toContain('<FeatureGrid');
    expect(readFileSync(path.join(site, 'src/pages/about-me.astro'), 'utf8')).toContain(
      'author.bio',
    );
    expect(readFileSync(path.join(site, 'src/pages/empty.astro'), 'utf8')).toContain('新页面');
  });

  it('页面列表含共用版式，不含组件文档和单篇版式', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'xiao-list-'));
    mkdirSync(path.join(site, 'src/pages/posts'), { recursive: true });
    mkdirSync(path.join(site, 'src/pages/xiao'), { recursive: true });
    mkdirSync(path.join(site, 'src/layouts/posts'), { recursive: true });
    writeFileSync(path.join(site, 'src/pages/index.astro'), 'HOME\n');
    writeFileSync(path.join(site, 'src/pages/posts/[...slug].astro'), 'POSTS\n');
    writeFileSync(path.join(site, 'src/pages/xiao/Card.astro'), 'DOC\n');
    writeFileSync(path.join(site, 'src/layouts/PostLayout.astro'), 'LAYOUT\n');
    writeFileSync(path.join(site, 'src/layouts/posts/hello.astro'), 'ARTICLE\n');
    const listed = listPages(site);
    expect(listed).toContain('src/pages/index.astro');
    expect(listed).toContain('src/pages/posts/[...slug].astro');
    expect(listed).toContain('src/layouts/PostLayout.astro');
    expect(listed).not.toContain('src/pages/xiao/Card.astro');
    expect(listed).not.toContain('src/layouts/posts/hello.astro');
  });

  it('画布只允许页面、共用版式和单篇版式', () => {
    expect(safePage('src/pages/about.astro')).toBe('src/pages/about.astro');
    expect(safePage('src/layouts/PostLayout.astro')).toBe('src/layouts/PostLayout.astro');
    expect(safePage('src/layouts/posts/hello-xiao.astro')).toBe(
      'src/layouts/posts/hello-xiao.astro',
    );
    expect(safePage('src/components/site/Header.astro')).toBe('src/components/site/Header.astro');
    expect(safePage('src/components/site/Footer.astro')).toBe('src/components/site/Footer.astro');
    expect(safePage('../etc/passwd')).toBe('src/pages/index.astro');
    expect(safePage('src/content/posts/hello-xiao/index.html')).toBe(
      'src/content/posts/hello-xiao/index.html',
    );
  });

  it('HTML 文章画布能读出正文结构并认出提示框', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'xiao-html-'));
    const dir = path.join(site, 'src/content/posts/html-note');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, 'index.html'),
      [
        '---',
        'title: HTML',
        'date: 2026-09-12',
        '---',
        '<div class="x-callout x-pad-md"><p>你好</p></div>',
        '<h2>标题</h2>',
        '',
      ].join('\n'),
    );
    const outline = readOutline(site, 'src/content/posts/html-note/index.html');
    expect(outline.map((node) => node.name)).toEqual(['Callout', 'Heading']);
    expect(outline[0]?.children[0]?.name).toBe('Text');
  });
});
