import { describe, expect, it } from 'vitest';
import { parseAstro } from '../ast/index.ts';
import { htmlNodeComponent, htmlSnippet } from './html-snippet.ts';

describe('HTML 画布片段', () => {
  it('生成的片段能被 Astro 模板解析', () => {
    for (const name of ['Section', 'Card', 'Callout', 'Text', 'Heading', 'Button', 'Divider']) {
      const snippet = htmlSnippet(name);
      expect(() => parseAstro(snippet)).not.toThrow();
      expect(snippet.includes(`data-xiao=`)).toBe(true);
    }
  });

  it('从 data-xiao 和 class 反推组件名', () => {
    expect(htmlNodeComponent('aside', [{ name: 'data-xiao', value: 'callout' }])).toBe('Callout');
    expect(htmlNodeComponent('div', [{ name: 'class', value: 'x-box x-card' }])).toBe('Card');
    expect(htmlNodeComponent('p', [])).toBe('Text');
  });

  it('带 YAML 头的 HTML 文章只解析正文', () => {
    const body = '<article class="x-post"><p>你好</p></article>\n';
    const doc = parseAstro(body);
    expect(doc.tree[0]?.name).toBe('article');
  });
});
