import { describe, expect, it } from 'vitest';
import {
  groupStudioPages,
  isArticleLayout,
  isHiddenStudioPage,
  isSharedLayout,
  isStudioPageFile,
  pageGroup,
  pageLabel,
} from './page-model.ts';

describe('页面分类', () => {
  it('首页和关于是站点页面，动态路由和默认版式是系统容器', () => {
    expect(pageGroup('src/pages/index.astro')).toBe('site');
    expect(pageGroup('src/pages/about.astro')).toBe('site');
    expect(pageGroup('src/pages/my-page.astro')).toBe('site');
    expect(pageGroup('src/pages/posts/[...slug].astro')).toBe('system');
    expect(pageGroup('src/pages/categories/[category].astro')).toBe('system');
    expect(pageGroup('src/layouts/PostLayout.astro')).toBe('system');
    expect(pageGroup('src/layouts/PageLayout.astro')).toBe('system');
  });

  it('单篇文章版式和组件文档页不出现在页面列表', () => {
    expect(isArticleLayout('src/layouts/posts/hello-xiao.astro')).toBe(true);
    expect(isStudioPageFile('src/layouts/posts/hello-xiao.astro')).toBe(false);
    expect(isHiddenStudioPage('src/pages/xiao/Card.astro')).toBe(true);
    expect(isStudioPageFile('src/pages/xiao/Card.astro')).toBe(false);
    expect(isSharedLayout('src/layouts/PostLayout.astro')).toBe(true);
    expect(isStudioPageFile('src/layouts/PostLayout.astro')).toBe(true);
  });

  it('标签对用户可读，分组时首页在前、系统容器单独一组', () => {
    expect(pageLabel('src/pages/index.astro')).toBe('首页');
    expect(pageLabel('src/pages/posts/[...slug].astro')).toBe('文章路由容器');
    expect(pageLabel('src/layouts/PostLayout.astro')).toBe('默认文章版式');
    expect(pageLabel('src/layouts/posts/hello-xiao.astro')).toBe('文章版式 · hello-xiao');
    const grouped = groupStudioPages([
      'src/pages/xiao/Card.astro',
      'src/pages/about.astro',
      'src/pages/posts/[...slug].astro',
      'src/pages/index.astro',
      'src/layouts/PostLayout.astro',
      'src/layouts/posts/hello.astro',
      'src/pages/land.astro',
    ]);
    expect(grouped.site).toEqual([
      'src/pages/index.astro',
      'src/pages/about.astro',
      'src/pages/land.astro',
    ]);
    expect(grouped.system).toEqual([
      'src/layouts/PostLayout.astro',
      'src/pages/posts/[...slug].astro',
    ]);
  });
});
