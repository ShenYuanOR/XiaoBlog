import { parse } from '@astrojs/compiler-rs';
import { describe, expect, it } from 'vitest';
import { parseAstro } from '../ast/index';
import { injectLoc } from './inject';
import { injectLoc as studioInject } from '../../../../apps/studio/resources/xiao-loc.mjs';

describe('injectLoc', () => {
  it('包装插件与核心注入一致，偏移就是大纲节点 id', () => {
    const source = '---\n---\n<main><p>文</p></main>\n';
    const file = 'src/pages/index.astro';
    expect(studioInject(source, file, parse)).toBe(injectLoc(source, file));
    const doc = parseAstro(source);
    const paragraph = doc.tree[0]?.children.find((node) => node.name === 'p');
    expect(injectLoc(source, file)).toContain(`data-xiao-loc="${file}:${paragraph?.id}"`);
  });

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
