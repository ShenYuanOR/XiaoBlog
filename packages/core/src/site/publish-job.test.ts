import { describe, expect, it } from 'vitest';
import { createPublishJobs, type PublishJobHooks } from '../../../../apps/studio/src/main/publish-job.ts';
import type { PreflightItem } from '../../../../apps/studio/src/main/publish-preflight.ts';

const passed: PreflightItem[] = [
  { key: 'url', ok: true, label: '站点地址', detail: '一致', more: '', slug: '', action: '' },
  { key: 'workflow', ok: true, label: '构建配置', detail: '就绪', more: '', slug: '', action: '' },
  { key: 'build', ok: true, label: '站点能构建', detail: '通过', more: '', slug: '', action: '' },
  { key: 'seo', ok: true, label: 'SEO', detail: '没有错误', more: '', slug: '', action: '' },
];

function hooks(overrides: Partial<PublishJobHooks> = {}): PublishJobHooks {
  return {
    now: () => 1_000,
    preflight: async () => ({ ok: true, items: passed }),
    push: async () => ({ ok: true, sha: 'abcdef1234567890' }),
    follow: async () => ({
      ok: true,
      build: { state: 'ok', detail: '远端构建成功。', ms: 20 },
      live: { state: 'ok', detail: '页面上已经是这次发布的版本。', ms: 5 },
    }),
    target: () => ({ remoteUrl: 'http://gitea.local/owner/site.git', siteUrl: 'https://blog.example' }),
    record: () => {},
    emit: () => {},
    ...overrides,
  };
}

describe('发布任务', () => {
  it('同一站点不重复起任务', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const jobs = createPublishJobs(
      hooks({
        preflight: async () => {
          calls += 1;
          await gate;
          return { ok: true, items: passed };
        },
      }),
    );
    const first = jobs.start('/site');
    const second = jobs.start('/site', true);
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('running');
    expect(calls).toBe(1);
    release();
    await jobs.settled('/site');
    expect(jobs.job('/site')?.status).toBe('ok');
  });

  it('结束后保留快照，dismiss 才清掉', async () => {
    const jobs = createPublishJobs(hooks());
    jobs.start('/site');
    await jobs.settled('/site');
    const done = jobs.job('/site');
    expect(done?.status).toBe('ok');
    expect(done?.sha.startsWith('abcdef1')).toBe(true);
    expect(done?.steps.find((step) => step.key === 'push')?.detail).toBe('已推送 abcdef1');
    jobs.dismiss('/site');
    expect(jobs.job('/site')).toBeNull();
  });

  it('进行中 dismiss 无效', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const jobs = createPublishJobs(
      hooks({
        preflight: async () => {
          await gate;
          return { ok: true, items: passed };
        },
      }),
    );
    jobs.start('/site');
    jobs.dismiss('/site');
    expect(jobs.job('/site')?.status).toBe('running');
    release();
    await jobs.settled('/site');
  });
});
