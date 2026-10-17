import { describe, expect, it } from 'vitest';
import { readActions, republish, summarizeLog } from '../../../../apps/studio/src/main/actions.ts';
import type { GitOps } from '../../../../apps/studio/src/main/git.ts';

describe('Actions', () => {
  it('按提交找到作业，失败日志只留最后 50 行', () => {
    const body = JSON.stringify({
      workflow_runs: [{ head_sha: 'abc' }],
      jobs: [
        { name: 'build', status: 'completed', conclusion: 'success' },
        { name: 'deploy', status: 'completed', conclusion: 'failure' },
      ],
    });
    expect(readActions(body, 'abc').jobs.map((job) => job.conclusion)).toEqual([
      'success',
      'failure',
    ]);
    expect(readActions(body, 'missing').found).toBe(false);
    const log = Array.from({ length: 60 }, (_item, index) => `行${index}`).join('\n');
    const summary = summarizeLog(log).split('\n');
    expect(summary).toHaveLength(50);
    expect(summary[0]).toBe('行10');
    expect(summary.at(-1)).toBe('行59');
  });

  it('重新发布是空提交后再普通推送', async () => {
    const steps: string[] = [];
    const git: GitOps = {
      commit: async (message) => {
        steps.push(message);
      },
      push: async (_ref, force) => {
        steps.push(force ? 'force' : 'push');
      },
      fetch: async () => undefined,
      pointAtRemote: async () => undefined,
      takeRemoteOnly: async () => undefined,
    };
    await republish(git, 'master', '重新发布：2026-10-17 16:40', { name: '晓', email: 'a@b.c' });
    expect(steps).toEqual(['重新发布：2026-10-17 16:40', 'push']);
  });
});
