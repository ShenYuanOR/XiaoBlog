import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { customizePost } from '../../../../apps/studio/src/main/content.ts';
import { createPage } from '../../../../apps/studio/src/main/pages.ts';

describe('自定义此页和页面模板', () => {
  it('自定义只复制当前文章的布局', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'xiao-page-'));
    const layout = path.join(site, 'src', 'layouts');
    mkdirSync(layout, { recursive: true });
    writeFileSync(path.join(layout, 'PostLayout.astro'), 'SHARED\n');
    const custom = customizePost(site, 'only-this');
    writeFileSync(path.join(site, custom), 'CUSTOM\n');
    expect(readFileSync(path.join(layout, 'PostLayout.astro'), 'utf8')).toBe('SHARED\n');
    expect(existsSync(path.join(site, 'src', 'layouts', 'posts', 'other.astro'))).toBe(false);
  });

  it('三个模板各自成页，不改首页', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'xiao-page-'));
    const index = path.join(site, 'src', 'pages', 'index.astro');
    mkdirSync(path.dirname(index), { recursive: true });
    writeFileSync(index, 'HOME\n');
    expect(createPage(site, 'blank', 'empty')).toBe('src/pages/empty.astro');
    expect(createPage(site, 'landing', 'land')).toContain('land.astro');
    expect(createPage(site, 'about', 'about-me')).toContain('about-me.astro');
    expect(readFileSync(index, 'utf8')).toBe('HOME\n');
    expect(readFileSync(path.join(site, 'src/pages/land.astro'), 'utf8')).toContain('<Section>');
    expect(readFileSync(path.join(site, 'src/pages/about-me.astro'), 'utf8')).toContain(
      'author.bio',
    );
    expect(readFileSync(path.join(site, 'src/pages/empty.astro'), 'utf8')).toContain('新页面');
  });
});
