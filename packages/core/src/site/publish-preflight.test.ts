import { describe, expect, it } from 'vitest';
import { buildPreflight, explainLocalBuild, siteBaseFromUrl } from '../../../../apps/studio/src/main/publish-preflight.ts';

const titles = { coffee: '咖啡' };

describe('发布前检查', () => {
  it('占位地址、构建失败、页面错误都用中文拦住', () => {
    const placeholder = buildPreflight({
      siteUrl: 'https://example.com',
      targetUrl: 'https://blog.xiaoblog.test',
      workflowReady: true,
      buildFailed: false,
      buildMessage: '',
      errors: [],
    });
    expect(placeholder.find((item) => item.key === 'url')).toMatchObject({
      ok: false,
      action: 'apply-url',
    });
    expect(placeholder.find((item) => item.key === 'url')?.detail).toContain('占位');
    expect(JSON.stringify(placeholder)).not.toContain('site-url-placeholder');

    const broken = buildPreflight({
      siteUrl: 'https://blog.xiaoblog.test',
      targetUrl: 'https://blog.xiaoblog.test',
      workflowReady: true,
      buildFailed: true,
      buildMessage: '文章 bad-date 的 HTML frontmatter date 格式不对：yesterday',
      errors: [],
    });
    expect(broken.find((item) => item.key === 'build')).toMatchObject({ ok: false });
    expect(broken.find((item) => item.key === 'build')?.detail).toContain('date 格式不对');

    const seo = buildPreflight({
      siteUrl: 'https://blog.xiaoblog.test',
      targetUrl: 'https://blog.xiaoblog.test',
      workflowReady: true,
      buildFailed: false,
      buildMessage: '',
      errors: [{ rule: 'og-image-missing-file', detail: '默认分享图不在构建产物里：/no-such.png' }],
    });
    const seoItem = seo.find((item) => item.key === 'seo');
    expect(seoItem?.ok).toBe(false);
    expect(seoItem?.detail).toContain('分享图文件不存在');
    expect(seoItem?.detail).not.toContain('og-image-missing-file');
    expect(seoItem?.action).toBe('seo');
  });

  it('开头信息写错时指出文章和行号，原文去掉堆栈和绝对路径', () => {
    const log = [
      'Flow sequence in block collection must be sufficiently indented and end with a ] at line 3, column 1:',
      'title: [坏',
      '  Location:',
      '    F:\\XiaoBlog\\blog\\test\\src\\content\\posts\\coffee\\index.md:2:0',
      '  Stack trace:',
      '    at Module.parse (F:\\XiaoBlog\\blog\\test\\node_modules\\yaml\\parse.js:1:1)',
    ].join('\n');
    const explained = explainLocalBuild(log, titles);
    expect(explained.summary).toBe('文章 coffee 开头信息第 2 行写法不对');
    expect(explained.slug).toBe('coffee');
    expect(explained.detail).toContain('src/content/posts/coffee/index.md:2:0');
    expect(explained.detail).not.toContain('Stack trace');
    expect(explained.detail).not.toContain('F:\\XiaoBlog');
    expect(explained.detail).not.toContain('at Module.parse');
    const item = buildPreflight({
      siteUrl: 'https://blog.xiaoblog.test',
      targetUrl: 'https://blog.xiaoblog.test',
      workflowReady: true,
      buildFailed: true,
      buildMessage: '构建没有通过',
      buildLog: log,
      postTitles: titles,
      errors: [],
    }).find((row) => row.key === 'build');
    expect(item).toMatchObject({ detail: explained.summary, action: 'open-post', slug: 'coffee' });
  });

  it('封面图找不到时按 cover 字段定位文章', () => {
    const log = [
      '[ImageNotFound] Could not find requested image `/media/nope-gate.png`. Does it exist?',
      '  Hint:',
      '    This is often caused by a typo in the image path. Please make sure the file exists, and is spelled correctly.',
      '  Location:',
      '    F:\\XiaoBlog\\blog\\test\\node_modules\\astro\\dist\\assets\\utils\\node.js:108:10',
      '  Stack trace:',
      '    at async (F:\\XiaoBlog\\blog\\test\\node_modules\\astro\\dist\\content\\vite-plugin-content-assets.js:36:1)',
    ].join('\n');
    const covers = { coffee: '/media/nope-gate.png' };
    const explained = explainLocalBuild(log, titles, covers);
    expect(explained.summary).toBe('文章《咖啡》的封面图 /media/nope-gate.png 找不到');
    expect(explained.slug).toBe('coffee');
    const missed = explainLocalBuild(log, titles, {});
    expect(missed.summary).toBe('封面图 /media/nope-gate.png 找不到');
    expect(missed.slug).toBe('');
    expect(explained.detail).toContain('typo in the image path');
    expect(explained.detail).toContain('node_modules/astro/dist/assets/utils/node.js:108:10');
    expect(explained.detail).not.toContain('Stack trace');
    expect(explained.detail).not.toContain('F:\\XiaoBlog');
    const item = buildPreflight({
      siteUrl: 'https://blog.xiaoblog.test',
      targetUrl: 'https://blog.xiaoblog.test',
      workflowReady: true,
      buildFailed: true,
      buildMessage: '',
      buildLog: log,
      postTitles: titles,
      postCovers: covers,
      errors: [],
    }).find((row) => row.key === 'build');
    expect(item?.action).toBe('open-post');
    expect(item?.slug).toBe('coffee');
  });

  it('站点配置 JSON 写坏时用中文说明行号，不给去 SEO', () => {
    const log = [
      'SyntaxError: Expected double-quoted property name in JSON at position 61 (line 3 column 16)',
      '    at JSON.parse (<anonymous>)',
      '    at file:///F:/XiaoBlog/blog/test/astro.config.mjs:9:16',
    ].join('\n');
    const explained = explainLocalBuild(log);
    expect(explained.summary).toBe(
      '站点配置 xiao.config.json 第 3 行第 16 列附近写法不对（常见原因：多了逗号、少了引号）',
    );
    expect(explained.detail).toContain('Expected double-quoted property name');
    expect(explained.detail).not.toContain('F:/XiaoBlog');
    expect(explained.slug).toBe('');
    const item = buildPreflight({
      siteUrl: 'https://blog.xiaoblog.test',
      targetUrl: 'https://blog.xiaoblog.test',
      workflowReady: true,
      buildFailed: true,
      buildMessage: 'Expected double-quoted property name in JSON at position 61 (line 3 column 16)',
      buildLog: log,
      errors: [],
    }).find((row) => row.key === 'build');
    expect(item?.action).toBe('');
    expect(item?.detail).toContain('第 3 行第 16 列');
    expect(item?.more).toContain('Expected double-quoted property name');
  });

  it('站点配置校验失败时不给文章入口', () => {
    const log = [
      'Error: xiao.config.json 字段无效：site.url',
      '    at file:///F:/XiaoBlog/blog/test/astro.config.mjs:12:9',
      '  Stack trace:',
      '    at loadConfig (F:\\XiaoBlog\\blog\\test\\node_modules\\astro\\dist\\core\\config.js:1:1)',
    ].join('\n');
    const explained = explainLocalBuild(log, titles);
    expect(explained.summary).toBe('站点配置 xiao.config.json 校验失败：site.url');
    expect(explained.slug).toBe('');
    expect(explained.detail).not.toContain('Stack trace');
    expect(explained.detail).not.toContain('F:/XiaoBlog');
    expect(explained.detail).not.toContain('F:\\XiaoBlog');
    const item = buildPreflight({
      siteUrl: 'https://blog.xiaoblog.test',
      targetUrl: 'https://blog.xiaoblog.test',
      workflowReady: true,
      buildFailed: true,
      buildMessage: log,
      postTitles: titles,
      errors: [],
    }).find((row) => row.key === 'build');
    expect(item).toMatchObject({ action: '', slug: '' });
    expect(item?.detail).toContain('xiao.config.json 校验失败');
  });

  it('按网址路径得到站点 base', () => {
    expect(siteBaseFromUrl('https://blog.xiaoblog.test')).toBe('/');
    expect(siteBaseFromUrl('https://name.github.io/blog')).toBe('/blog/');
  });
});
