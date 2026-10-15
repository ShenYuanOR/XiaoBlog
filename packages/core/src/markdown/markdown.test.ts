import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { markDirty, openMarkdown, saveMarkdown, simulateEditor, writeBlocks } from './index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(here, '../../../../docs');

function listMarkdown(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...listMarkdown(full));
    else if (name.endsWith('.md')) found.push(full);
  }
  return found;
}

const fixtures: Record<string, string> = {
  emphasis: '这是 *星号* 和 _下划线_ 以及 **粗** 与 __粗二__。\n',
  bullets: '- 甲\n- 乙\n  - 丙\n',
  ordered: '1. 第一\n1. 第二\n1. 第三\n',
  rule: '上\n\n---\n\n下\n',
  'hard-break': '第一行  \n第二行\n',
  'soft-break': '这是 *跨行\n强调* 文本。\n',
  'code-meta': '```ts title="a.ts"\nconst n = 1\n```\n',
  reference: '见 [文档][ref]。\n\n[ref]: https://example.com/docs\n',
  image: '![测试图片](./cover.png)\n',
  autolink: '见 <http://example.com/foo\\bar>。\n',
  container: '::: tip\n容器里的话\n:::\n',
  html: '<div class="note">原文 HTML</div>\n',
  table: '| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n',
};

function changedLines(before: string, after: string): string[] {
  const left = before.split(/\r?\n/);
  const right = after.split(/\r?\n/);
  const count = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (left[i] !== right[i]) lines.push(right[i] ?? '');
  }
  return lines;
}

describe('打开即保存', () => {
  const files = listMarkdown(docsRoot);
  const samples = [
    ...files.map((file) => ({
      name: path.relative(docsRoot, file),
      source: readFileSync(file, 'utf8'),
    })),
    ...Object.entries(fixtures).map(([name, source]) => ({ name, source })),
  ];

  it('语料不少于 20 篇', () => {
    expect(samples.length).toBeGreaterThanOrEqual(20);
  });

  it.each(samples)('$name 打开后触发保存，正文零 diff', ({ source }) => {
    const session = markDirty(openMarkdown(source));
    const current = simulateEditor(session.body, session.style);
    const saved = saveMarkdown(session, current);
    expect(saved.text).toBe(source);
    expect(saved.reason === 'rejected').toBe(false);
  });

  it('未编辑不写盘', () => {
    const source = fixtures.bullets ?? '';
    const saved = saveMarkdown(openMarkdown(source), '完全不同的正文\n');
    expect(saved.write).toBe(false);
    expect(saved.reason).toBe('clean');
    expect(saved.text).toBe(source);
  });
});

describe('只改一段', () => {
  it('diff 落在被改的段落', () => {
    const source = '第一段保持不动。\n\n第二段会被改掉。\n\n第三段也保持。\n';
    const session = markDirty(openMarkdown(source));
    const current = simulateEditor(session.body, session.style).replace(
      '第二段会被改掉。',
      '第二段已经改了。',
    );
    const saved = saveMarkdown(session, current);
    expect(saved.write).toBe(true);
    expect(saved.text).toContain('第一段保持不动。');
    expect(saved.text).toContain('第三段也保持。');
    expect(saved.text).toContain('第二段已经改了。');
    const lines = changedLines(source, saved.text);
    expect(lines.every((line) => line.includes('第二段已经改了') || line.trim() === '')).toBe(true);
  });
});

describe('守卫语法原样', () => {
  it.each(['code-meta', 'reference', 'image', 'autolink', 'container', 'html'] as const)(
    '%s 被编辑器打散后仍保留原文',
    (name) => {
      const source = fixtures[name] ?? '';
      const session = markDirty(openMarkdown(source));
      const current = `${simulateEditor(session.body, session.style)}\n\n额外一段。\n`;
      const saved = saveMarkdown(session, current);
      const kept = saved.write ? saved.text : saved.text;
      expect(kept).toContain(source.trim().split('\n')[0] ?? '');
      if (saved.write) expect(saved.text).toContain('额外一段');
    },
  );
});

describe('上游缺陷', () => {
  it('#2349 反斜杠自动链接不会越存越多', () => {
    const source = fixtures.autolink ?? '';
    let current = source;
    for (let i = 0; i < 3; i += 1) current = simulateEditor(current, openMarkdown(source).style);
    const saved = saveMarkdown(markDirty(openMarkdown(source)), current);
    const text = saved.text;
    const backs = text.match(/\\/g)?.length ?? 0;
    const originalBacks = source.match(/\\/g)?.length ?? 0;
    expect(backs).toBe(originalBacks);
  });

  it('#2493 跨软换行的强调不会被写成硬换行', () => {
    const source = fixtures['soft-break'] ?? '';
    const corrupted = '这是 *跨行\\\n强调* 文本。\n';
    const saved = saveMarkdown(markDirty(openMarkdown(source)), corrupted);
    expect(saved.text).toBe(source);
    expect(saved.text.includes('\\\n')).toBe(false);
  });
});

describe('frontmatter', () => {
  it('只替换改动的键，正文不动', () => {
    const source = '---\ntitle: 旧标题\ndate: 2026-08-14\n---\n\n正文不变。\n';
    const session = openMarkdown(source);
    const saved = saveMarkdown(session, session.body, { title: '新标题' });
    expect(saved.write).toBe(true);
    expect(saved.text).toContain('title: 新标题');
    expect(saved.text).toContain('date: 2026-08-14');
    expect(saved.text).toContain('正文不变。');
  });
});

describe('直接回写', () => {
  it('writeBlocks 在语义相同时返回原文', () => {
    const source = fixtures.bullets ?? '';
    const session = openMarkdown(source);
    expect(
      writeBlocks(session.body, simulateEditor(session.body, session.style), session.style),
    ).toBe(source);
  });
});
