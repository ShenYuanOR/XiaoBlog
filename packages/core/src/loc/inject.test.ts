import { describe, expect, it } from 'vitest';
import { injectLoc } from './inject';

describe('injectLoc', () => {
  it('带 spread 的元素不注入，避免盖住调用处标记', () => {
    const source = ['<article class="card" {...rest}>', '  <h2>标题</h2>', '</article>', ''].join(
      '\n',
    );
    const next = injectLoc(source, 'src/components/Card.astro');
    expect(next.startsWith('<article class="card" {...rest}>')).toBe(true);
    const heading = source.indexOf('<h2');
    expect(next).toContain(`<h2 data-xiao-loc="src/components/Card.astro:${heading}"`);
  });

  it('组件调用处使用该标签的起始偏移', () => {
    const source = '---\n---\n<Card title="你好" />\n';
    const start = source.indexOf('<Card');
    const next = injectLoc(source, 'src/pages/index.astro');
    expect(next).toContain(`<Card data-xiao-loc="src/pages/index.astro:${start}" title="你好" />`);
    expect(source.slice(start, start + 5)).toBe('<Card');
  });

  it('已有标记时不重复注入', () => {
    const source = '<p data-xiao-loc="a.astro:0">文</p>\n';
    expect(injectLoc(source, 'a.astro')).toBe(source);
  });

  it('CRLF 与中文路径的偏移仍指向小于号', () => {
    const source = '---\r\n---\r\n<p>你好</p>\r\n';
    const next = injectLoc(source, '页面/index.astro');
    const match = /data-xiao-loc="页面\/index\.astro:(\d+)"/.exec(next);
    expect(match).not.toBeNull();
    const offset = Number(match?.[1]);
    expect(source[offset]).toBe('<');
    expect(source.slice(offset, offset + 2)).toBe('<p');
  });
});
