import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtures } from './fixtures.ts';
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

describe('守卫块被修改', () => {
  it('改了带 meta 的代码块就拒绝写盘', () => {
    const source = fixtures['code-meta'] ?? '';
    const edited = source
      .replace('title="a.ts"', 'title="b.ts"')
      .replace('const n = 1', 'const n = 2');
    const saved = saveMarkdown(markDirty(openMarkdown(source)), edited);
    expect(saved.write).toBe(false);
    expect(saved.code).toBe('GUARDED_BLOCK_EDITED');
    expect(saved.text).toBe(source);
  });

  it('守卫块没变时，普通段落仍可写回', () => {
    const source = `普通段落。\n\n${fixtures['code-meta'] ?? ''}`;
    const session = markDirty(openMarkdown(source));
    const current = simulateEditor(session.body, session.style).replace(
      '普通段落。',
      '普通段落已改。',
    );
    const saved = saveMarkdown(session, current);
    expect(saved.code).toBeUndefined();
    expect(saved.text).toContain('普通段落已改。');
    expect(saved.text).toContain('title="a.ts"');
    expect(saved.text).not.toContain('普通段落。');
  });
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
