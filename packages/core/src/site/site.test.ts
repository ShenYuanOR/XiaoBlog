import { describe, expect, it } from 'vitest';
import { blogPostingJsonLd, openGraphHead } from './seo.ts';
import { isValidSlug, slugFromTitle } from './slug.ts';
import { withBase } from './url.ts';
import { findDeadLinks, validatePosts } from './validate.ts';

describe('base 拼接', () => {
  it('没有尾斜杠时也会补上', () => {
    expect(withBase('/demo', 'note/')).toBe('/demo/note/');
    expect(withBase('/demo/', '/note/')).toBe('/demo/note/');
    expect(withBase('/')).toBe('/');
  });
});

describe('slug', () => {
  it('只接受小写连字符', () => {
    expect(isValidSlug('hello-xiao')).toBe(true);
    expect(isValidSlug('Hello')).toBe(false);
  });

  it('中文标题转拼音', () => {
    expect(slugFromTitle('你好')).toBe('ni-hao');
  });
});

describe('seo', () => {
  it('文章头包含 OG 与 JSON-LD', () => {
    const post = {
      url: 'https://example.com/demo/posts/hello/',
      title: '你好',
      description: '说明',
      date: '2026-08-14',
      tags: ['随笔'],
    };
    expect(
      openGraphHead('晓', post, 'https://example.com').some(
        (entry) => entry.attrs?.property === 'og:title',
      ),
    ).toBe(true);
    const json = blogPostingJsonLd(post, { name: '作者' }, 'https://example.com');
    expect(json[0]?.children).toContain('BlogPosting');
  });
});

describe('校验', () => {
  it('重复 slug 是 error', () => {
    const issues = validatePosts([
      { slug: 'hello', title: '一', description: '说明', content: '' },
      { slug: 'hello', title: '二', description: '说明', content: '' },
    ]);
    expect(issues.some((issue) => issue.level === 'error' && issue.rule === 'slug')).toBe(true);
  });

  it('死链只看站内路径', () => {
    const html =
      '<a href="/missing">x</a><a href="https://example.com">y</a><a href="/about">z</a>';
    expect(findDeadLinks(html, new Set(['/about']))).toEqual(['/missing']);
  });
});
