import { describe, expect, it } from 'vitest';
import {
  blockedBy,
  groupChanges,
  rememberDeploy,
  renewalDue,
} from '../../../../apps/studio/src/main/release-gate.ts';

describe('发布门禁', () => {
  it('改动按文章、页面、设置分组，有 error 不能发布', () => {
    const groups = groupChanges([
      ' M src/content/posts/hello/index.md',
      ' M src/pages/index.astro',
      ' M xiao.config.json',
    ]);
    expect(groups.posts).toEqual(['src/content/posts/hello/index.md']);
    expect(groups.pages).toEqual(['src/pages/index.astro']);
    expect(groups.settings).toEqual(['xiao.config.json']);
    expect(blockedBy([{ level: 'error' }, { level: 'warn' }])).toBe(true);
    expect(blockedBy([{ level: 'warn' }])).toBe(false);
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
});
