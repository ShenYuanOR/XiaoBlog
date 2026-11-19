import { describe, expect, it } from 'vitest';
import { buildPreflight, siteBaseFromUrl } from '../../../../apps/studio/src/main/publish-preflight.ts';

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

  it('按网址路径得到站点 base', () => {
    expect(siteBaseFromUrl('https://blog.xiaoblog.test')).toBe('/');
    expect(siteBaseFromUrl('https://name.github.io/blog')).toBe('/blog/');
  });
});
