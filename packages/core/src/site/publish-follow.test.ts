import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractFailureLog, waitForLive, watchBuild } from '../../../../apps/studio/src/main/publish-follow.ts';

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
        const stamp = '2026-11-19T12:00:00.0000000Z ';
        return new Response(
          [
            `${stamp}\u001b[31m⭐ Run Main 构建\u001b[0m`,
            `${stamp}can not read a block mapping entry; a multiline key may not be an implicit key`,
            `${stamp}src/content/posts/coffee/index.md:2:0`,
            `${stamp}Stack trace:`,
            `${stamp}    at Module.parse (/workspace/shenyuan/xiao-gate/site/node_modules/yaml/parse.js:1:1)`,
            `${stamp}❌  Failure - Main 构建`,
            `${stamp}Cleaning up container`,
          ].join('\n'),
        );
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
    expect(result.log?.startsWith('构建失败')).toBe(true);
    expect(result.log).toContain('src/content/posts/coffee/index.md:2:0');
    expect(result.log).toContain('multiline key');
    expect(result.log).not.toContain('Stack trace');
    expect(result.log).not.toContain('/workspace/');
    expect(result.log).not.toContain('at Module.parse');
    expect(result.url).toContain('/actions/runs/3');
  });

  it('同一提交取最新运行，90 秒没有运行就停', async () => {
    let time = 0;
    const result = await watchBuild({
      remoteUrl: 'http://gitea.local/owner/site.git',
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

  it('真实失败日志只留构建步骤，路径改成相对路径', () => {
    const sample = extractFailureLog(readFileSync(new URL('./fixtures/gitea-build-fail.log', import.meta.url), 'utf8'));
    expect(sample.startsWith('构建失败')).toBe(true);
    expect(sample).toContain('src/content/posts/coffee/index.md:2:0');
    expect(sample).not.toContain('Writing entry');
    expect(sample).not.toContain('expression');
    expect(sample).not.toContain('Stack trace');
    expect(sample).not.toContain('/workspace/');
    expect(sample).not.toContain('[ELIFECYCLE]');
    expect(sample).not.toContain('at Composer');
    expect(sample.split('\n').some((line) => /^\d{4}-\d\d-\d\dT[\d:.]+Z\s*$/.test(line))).toBe(false);
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
