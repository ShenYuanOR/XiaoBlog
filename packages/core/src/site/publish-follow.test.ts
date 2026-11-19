import { describe, expect, it } from 'vitest';
import { waitForLive, watchBuild } from '../../../../apps/studio/src/main/publish-follow.ts';

const sleep = async (): Promise<void> => {};

describe('跟踪发布', () => {
  it('没有构建机时马上说明，不等待', async () => {
    const result = await watchBuild({
      remoteUrl: 'http://gitea.local/owner/site.git',
      token: 'token',
      sha: 'abc',
      actionsState: 'no-runner',
      actionsDetail: '没有在线的构建机。推送后不会开始构建。',
      sleep,
      attempts: 3,
    });
    expect(result.state).toBe('fail');
    expect(result.detail).toContain('没有在线的构建机');
  });

  it('构建失败时带上日志末尾和查看链接', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes('/jobs/') && url.endsWith('/logs')) {
        return new Response('第一行\n构建失败：依赖没装上\n');
      }
      if (url.includes('/jobs')) {
        return new Response(JSON.stringify({ jobs: [{ id: 7, conclusion: 'failure' }] }));
      }
      return new Response(
        JSON.stringify({
          workflow_runs: [{ id: 3, status: 'completed', conclusion: 'failure', head_sha: 'abc', html_url: 'http://gitea.local/owner/site/actions/runs/3' }],
        }),
      );
    }) as typeof fetch;
    const result = await watchBuild({
      remoteUrl: 'http://gitea.local/owner/site.git',
      token: 'token',
      sha: 'abc',
      actionsState: 'ready',
      fetchImpl,
      sleep,
      attempts: 1,
    });
    expect(result.state).toBe('fail');
    expect(result.log).toContain('依赖没装上');
    expect(result.url).toContain('/actions/runs/3');
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
  });
});
