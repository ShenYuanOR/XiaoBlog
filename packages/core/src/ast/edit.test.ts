import { describe, expect, it } from 'vitest';
import {
  assertDiskUnchanged,
  detectPrettierClean,
  findNode,
  formatAstro,
  hashSource,
  insertNode,
  moveNode,
  parseAstro,
  removeNode,
  removeProp,
  setProp,
} from './index';
import type { AstroDoc, EditableNode } from './types';

function crlf(source: string): string {
  return source.replace(/\n/g, '\r\n');
}

function root(doc: AstroDoc): EditableNode {
  const node = doc.tree[0];
  if (!node) throw new Error('没有根节点');
  return node;
}

describe('偏移', () => {
  it('中文、emoji 和 CRLF 的切片与原文一致', () => {
    const source = crlf('---\nconst title = "标题";\n---\n<p>你好 👋</p>\n');
    const doc = parseAstro(source);
    const text = root(doc).children[0];
    expect(text?.kind).toBe('text');
    expect(source.slice(text!.start, text!.end)).toBe('你好 👋');
    expect(doc.eol).toBe('\r\n');
  });
});

describe('属性识别', () => {
  const source = [
    '---',
    '---',
    '<div class="a" className=\'b\' bare=c empty="" disabled data-x={1} {flag} title={`x`} {...rest}>',
    '  {/* note */}',
    '</div>',
    '',
  ].join('\n');

  it('区分可编辑属性和锁定属性', () => {
    const node = root(parseAstro(source));
    const kinds = Object.fromEntries(
      (node.props ?? []).map((prop) => [prop.name, prop.value.kind]),
    );
    expect(kinds.class).toBe('string');
    expect(kinds.className).toBe('string');
    expect(kinds.bare).toBe('string');
    expect(kinds.empty).toBe('string');
    expect(kinds.disabled).toBe('boolean-flag');
    expect(kinds['data-x']).toBe('literal');
    expect(kinds.flag).toBe('locked');
    expect(kinds.title).toBe('locked');
    expect(node.lockedReason).toBe('spread');
    expect(
      source.slice(
        node.props?.find((prop) => prop.name === 'class')!.start,
        node.props?.find((prop) => prop.name === 'class')!.end,
      ),
    ).toBe('class="a"');
  });
});

describe('五种操作', () => {
  const bases = ['box', 'card', 'note', 'row', 'item'];

  it('setProp 只改目标属性', () => {
    for (const name of bases) {
      const source = `<section><p class="old" id="${name}">正文</p></section>\n`;
      const doc = parseAstro(source);
      const p = root(doc).children[0];
      const next = setProp(doc, p!.id, 'class', 'new');
      expect(next).toContain('class="new"');
      expect(next).toContain(`id="${name}"`);
      expect(next).toContain('正文');
      expect(parseAstro(next).tree.length).toBeGreaterThan(0);
    }
  });

  it('removeProp 删掉属性和它前面的空格', () => {
    for (const name of bases) {
      const source = `<section><p id="${name}" hidden>正文</p></section>\n`;
      const doc = parseAstro(source);
      const p = root(doc).children[0];
      const next = removeProp(doc, p!.id, 'hidden');
      expect(next).not.toContain('hidden');
      expect(next).toContain(`id="${name}"`);
      expect(parseAstro(next).tree.length).toBeGreaterThan(0);
    }
  });

  it('insertNode 插到指定位置', () => {
    for (const name of bases) {
      const source = `<section>\n  <p>${name}</p>\n</section>\n`;
      const doc = parseAstro(source);
      const next = insertNode(doc, root(doc).id, 1, '<span>尾</span>');
      expect(next).toContain(`<p>${name}</p>`);
      expect(next.indexOf('<span>尾</span>')).toBeGreaterThan(next.indexOf(`<p>${name}</p>`));
      expect(parseAstro(next).tree.length).toBeGreaterThan(0);
    }
  });

  it('removeNode 删掉独占一行的节点', () => {
    for (const name of bases) {
      const source = `<section>\n  <p>${name}</p>\n  <span>留</span>\n</section>\n`;
      const doc = parseAstro(source);
      const p = root(doc).children[0];
      const next = removeNode(doc, p!.id);
      expect(next).not.toContain(`<p>${name}</p>`);
      expect(next).toContain('<span>留</span>');
      expect(parseAstro(next).tree.length).toBeGreaterThan(0);
    }
  });

  it('moveNode 把节点移到另一个父节点', () => {
    for (const name of bases) {
      const source = `<main>\n  <section id="a"><p>${name}</p></section>\n  <section id="b"></section>\n</main>\n`;
      const doc = parseAstro(source);
      const main = root(doc);
      const from = main.children[0];
      const to = main.children[1];
      const moving = from?.children[0];
      const next = moveNode(doc, moving!.id, to!.id, 0);
      const again = parseAstro(next);
      const target = root(again).children[1];
      expect(
        target?.children.some((child) => next.slice(child.start, child.end).includes(name)),
      ).toBe(true);
      expect(parseAstro(next).tree.length).toBeGreaterThan(0);
    }
  });
});

describe('锁定块', () => {
  const source = [
    '---',
    'const items = [1];',
    'const show = true;',
    '---',
    '<div>',
    '  {items.map((item) => <p>{item}</p>)}',
    '  {show ? <em>是</em> : <em>否</em>}',
    '  <style>color: red;</style>',
    '  <script>const n = 1;</script>',
    '  <div is:raw><span>原样</span></div>',
    '</div>',
    '',
  ].join('\n');

  it('表达式、style、script 和 is:raw 都是锁定块', () => {
    const node = root(parseAstro(source));
    const reasons = node.children.map((child) => child.lockedReason);
    expect(reasons).toEqual(['expression', 'expression', 'style', 'script', 'raw']);
  });

  it('移动锁定块不改内部文本', () => {
    const host = [
      '<main>',
      '  <div>',
      '    <style>color: red;</style>',
      '  </div>',
      '  <section></section>',
      '</main>',
      '',
    ].join('\n');
    const hostDoc = parseAstro(host);
    const from = root(hostDoc).children[0];
    const styleNode = from?.children.find((child) => child.lockedReason === 'style');
    const to = root(hostDoc).children[1];
    if (!styleNode || !to) throw new Error('夹具缺少锁定块');
    const before = hostDoc.source.slice(styleNode.start, styleNode.end);
    const next = moveNode(hostDoc, styleNode.id, to.id, 0);
    expect(before).toBe('<style>color: red;</style>');
    expect(next).toContain(before);
    const moved = root(parseAstro(next)).children[1]?.children[0];
    expect(moved && next.slice(moved.start, moved.end)).toBe(before);
  });

  it('删除锁定块后其余锁定块内部不变', () => {
    const doc = parseAstro(source);
    const node = root(doc);
    const script = node.children[3];
    const raw = node.children[4];
    const rawText = doc.source.slice(raw!.start, raw!.end);
    const next = removeNode(doc, script!.id);
    expect(next).toContain(rawText);
    expect(next).not.toContain('<script>');
  });
});

describe('写盘前校验', () => {
  it('外部修改会使哈希不一致', () => {
    const opened = '<p>a</p>\n';
    expect(() => assertDiskUnchanged(opened, '<p>b</p>\n')).toThrow(/外部修改/);
    expect(hashSource(opened)).toBe(hashSource(opened));
  });
});

describe('Prettier 幂等', () => {
  const source = ['---', '---', '<main>', '  <p class="title">标题</p>', '</main>', ''].join('\n');

  it('连续格式化两次结果一致', async () => {
    const once = await formatAstro(source);
    const twice = await formatAstro(once);
    expect(twice).toBe(once);
    expect(await detectPrettierClean(once)).toBe(true);
  });
});

describe('查找', () => {
  it('能按 id 找到子节点', () => {
    const doc = parseAstro('<div>\n  <p>a</p>\n</div>\n');
    const child = root(doc).children[0];
    expect(findNode(doc.tree, child!.id)?.name).toBe('p');
  });
});
