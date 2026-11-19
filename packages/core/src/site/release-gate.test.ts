import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectChanges } from '../../../../apps/studio/src/main/publish-changes.ts';
import {
  blockedBy,
  parseStatus,
  historyConclusion,
  historyRows,
  historyStepDetail,
  rememberDeploy,
  renewalDue,
  summarizeChanges,
} from '../../../../apps/studio/src/main/release-gate.ts';

describe('发布门禁', () => {
  it('改动带状态，文章按目录归并，设置样式模板归成一组', () => {
    const files = parseStatus(
      [
        '?? src/content/posts/coffee/index.md',
        '?? src/content/posts/coffee/cover.png',
        ' D src/content/posts/hello/index.md',
        ' M src/pages/index.astro',
        ' M xiao.config.json',
        ' M src/styles/base.css',
        '?? src/theme.json',
        '?? src/layouts/BaseLayout.astro',
        'R  src/pages/old.astro -> src/pages/new.astro',
      ].join('\n'),
    );
    const summary = summarizeChanges(files, (slug) => (slug === 'coffee' ? '咖啡' : '你好，晓'));
    expect(summary.posts.map((post) => [post.slug, post.title, post.status])).toEqual([
      ['coffee', '咖啡', 'added'],
      ['hello', '你好，晓', 'deleted'],
    ]);
    expect(summary.pages.map((file) => [file.path, file.status])).toEqual([
      ['src/pages/index.astro', 'modified'],
      ['src/pages/new.astro', 'renamed'],
    ]);
    expect(summary.pages.find((file) => file.status === 'renamed')?.from).toBe('src/pages/old.astro');
    expect(summary.settings.map((file) => file.path).sort()).toEqual([
      'src/layouts/BaseLayout.astro',
      'src/styles/base.css',
      'src/theme.json',
      'xiao.config.json',
    ]);
    expect(summary.settingsStatus).toBe('modified');
    expect(blockedBy([{ level: 'error' }, { level: 'warn' }])).toBe(true);
    expect(blockedBy([{ level: 'warn' }])).toBe(false);
  });

  it('未跟踪的新文章是新增并带标题，删掉已提交文章是删除', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xiao-changes-'));
    const git = (args: string[]) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true });
    try {
      git(['init', '-b', 'master']);
      git(['config', 'user.email', 'test@example.com']);
      git(['config', 'user.name', 'test']);
      const hello = join(dir, 'src', 'content', 'posts', 'hello');
      mkdirSync(hello, { recursive: true });
      writeFileSync(join(hello, 'index.md'), "---\ntitle: 你好，晓\n---\n正文\n", 'utf8');
      git(['add', '.']);
      git(['commit', '-m', 'init']);
      const coffee = join(dir, 'src', 'content', 'posts', 'coffee');
      mkdirSync(coffee, { recursive: true });
      writeFileSync(join(coffee, 'index.md'), "---\ntitle: '咖啡'\n---\n正文\n", 'utf8');
      unlinkSync(join(hello, 'index.md'));
      const summary = collectChanges(dir);
      const coffeeRow = summary.posts.find((post) => post.slug === 'coffee');
      const helloRow = summary.posts.find((post) => post.slug === 'hello');
      expect(coffeeRow).toMatchObject({ title: '咖啡', status: 'added' });
      expect(helloRow).toMatchObject({ title: '你好，晓', status: 'deleted' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('部署历史只留 20 条，到期前 7 天提示续期', () => {
    let history: { at: string; repo: string }[] = [];
    for (let index = 0; index < 25; index += 1) {
      history = rememberDeploy(history, { at: String(index), repo: 'owner/blog' });
    }
    expect(history).toHaveLength(20);
    expect(history[0]?.at).toBe('5');
    const now = new Date('2026-10-17T00:00:00Z');
    expect(renewalDue('2026-10-20T00:00:00Z', now)).toBe(true);
    expect(renewalDue('2026-12-01T00:00:00Z', now)).toBe(false);
  });

  it('写盘失败时发布记录留在内存，并带短提交号、四步和总耗时', () => {
    const row = {
      at: '2026-11-19T07:46:11.000Z',
      repo: 'http://gitea.local/owner/site.git',
      sha: '213933cd2d3bed60409acae015c6c6fd336bdf0f',
      ms: 39000,
      result: '已上线',
      steps: [
        { key: 'check' as const, label: '检查', state: 'ok' as const, ms: 2000 },
        { key: 'push' as const, label: '推送', state: 'ok' as const, ms: 2100 },
        { key: 'build' as const, label: '远端构建', state: 'ok' as const, ms: 34700 },
        { key: 'live' as const, label: '上线', state: 'ok' as const, ms: 200 },
      ],
    };
    const kept = rememberDeploy([], row);
    expect(kept[0]?.sha?.slice(0, 7)).toBe('213933c');
    expect(kept[0]?.steps).toHaveLength(4);
    expect(kept[0]?.ms).toBe(39000);
    expect(historyRows(kept, [])).toEqual(kept);
    expect(historyRows(undefined, [])).toEqual([]);
    expect(historyConclusion(row)).toBe('已上线');
    expect(historyStepDetail(row.steps)).toContain('检查完成');
    expect(historyConclusion({ steps: [{ label: '远端构建', state: 'fail' }] })).toBe('停在远端构建');
  });
});
