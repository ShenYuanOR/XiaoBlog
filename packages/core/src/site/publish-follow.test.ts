import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractGithubFailureLog, runDurationMs, waitForLive, watchBuild } from '../../../../apps/studio/src/main/publish-follow.ts';

const sleep = async (): Promise<void> => {};

describe('跟踪发布', () => {
  it('不是 GitHub 就不跟踪构建', async () => {
    const result = await watchBuild({
      remoteUrl: 'https://example.com/owner/site.git',
      token: 'token',
      sha: 'abc',
      sleep,
    });
    expect(result.state).toBe('fail');
    expect(result.detail).toContain('只发布到 GitHub');
  });

  it('同一提交取最新运行，90 秒没有运行就停', async () => {
    let time = 0;
    const result = await watchBuild({
      remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test.git',
      token: 'token',
      sha: 'abc',
      actionsState: 'ready',
      fetchImpl: (async () => new Response(JSON.stringify({ workflow_runs: [] }))) as typeof fetch,
      now: () => time,
      sleep: async (ms: number) => {
        time += ms;
      },
    });
    expect(result.detail).toContain('没有为这次提交启动构建');
  });

  it('远端构建耗时用运行记录的开始和结束', () => {
    expect(
      runDurationMs(
        { started_at: '2026-11-19T08:00:00.000Z', completed_at: '2026-11-19T08:00:34.700Z' },
        100,
      ),
    ).toBe(34700);
    expect(runDurationMs({}, 100)).toBe(100);
  });

  it('读到 xiao-build 才算上线', async () => {
    const html = '<html><head><meta name="xiao-build" content="abc123"></head></html>';
    const found = await waitForLive({
      siteUrl: 'https://blog.xiaoblog.test',
      sha: 'abc123',
      fetchImpl: (async () => new Response(html)) as typeof fetch,
      sleep,
      attempts: 1,
    });
    expect(found.state).toBe('ok');
    const missed = await waitForLive({
      siteUrl: 'https://blog.xiaoblog.test',
      sha: 'abc123',
      fetchImpl: (async () => new Response('<html></html>')) as typeof fetch,
      sleep,
      attempts: 1,
    });
    expect(missed.state).toBe('fail');
    expect(missed.detail).toContain('版本号');
    expect(missed.detail).not.toContain('1～2 分钟');
  });

  it('GitHub 按 head_sha 查 Actions，失败日志取失败步骤', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push(url);
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      if (!auth.startsWith('Bearer ')) throw new Error('github auth');
      if (url.includes('/api/v1/')) throw new Error('gitea url');
      if (url.includes('/jobs/') && url.endsWith('/logs')) {
        return new Response(readFileSync(new URL('./fixtures/github-build-fail.log', import.meta.url), 'utf8'));
      }
      if (url.includes('/jobs')) {
        return new Response(JSON.stringify({ jobs: [{ id: 9, conclusion: 'failure', steps: [{ name: '安装依赖', conclusion: 'failure' }] }] }));
      }
      return new Response(
        JSON.stringify({
          workflow_runs: [{ id: 4, status: 'completed', conclusion: 'failure', head_sha: 'abc', html_url: 'https://github.com/ShenYuanOR/xiao-pages-test/actions/runs/4' }],
        }),
      );
    }) as typeof fetch;
    const result = await watchBuild({
      remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test.git',
      token: 'token',
      sha: 'abc',
      actionsState: 'unknown',
      fetchImpl,
      sleep,
      attempts: 1,
    });
    expect(seen[0]).toContain('https://api.github.com/repos/ShenYuanOR/xiao-pages-test/actions/runs?head_sha=abc');
    expect(result.state).toBe('fail');
    expect(result.log).toContain('安装依赖失败');
    expect(result.log).toContain('ERR_PNPM_OUTDATED_LOCKFILE');
    expect(result.log).not.toContain('shell:');
    expect(result.url).toContain('github.com/ShenYuanOR/xiao-pages-test/actions/runs/4');
  });

  it('合成的 GitHub 日志能截出失败步骤（还没有真实样例）', () => {
    const sample = extractGithubFailureLog(readFileSync(new URL('./fixtures/github-build-fail.log', import.meta.url), 'utf8'));
    expect(sample.startsWith('pnpm install --frozen-lockfile失败')).toBe(true);
    expect(sample).toContain('ERR_PNPM_OUTDATED_LOCKFILE');
    expect(sample).toContain('exit code 1');
    expect(sample).not.toContain('shell:');
    expect(sample).not.toContain('2026-11-19T');
  });

  it('GitHub Pages 超时提示写明首次要等 1～2 分钟', async () => {
    const missed = await waitForLive({
      siteUrl: 'https://shenyuanor.github.io/xiao-pages-test/',
      sha: 'abc',
      provider: 'github',
      fetchImpl: (async () => new Response('<html></html>')) as typeof fetch,
      sleep,
      attempts: 1,
    });
    expect(missed.detail).toContain('1～2 分钟');
    expect(missed.detail).toContain('CDN');
  });
});
