import { describe, expect, it } from 'vitest';
import {
  createVerifyCache,
  explainWorkflowScope,
  githubPagesUrl,
  giteaPagesUrl,
  mergeProbe,
  probeTokenCapabilities,
  readGithubVerify,
  readGiteaVerify,
  requiredMissing,
  verifyCacheKey,
} from '../../../../apps/studio/src/main/publish-token.ts';

describe('令牌验证', () => {
  it('GitHub 经典令牌按 scopes 列出能力', () => {
    const report = readGithubVerify({
      status: 200,
      scopes: 'repo, workflow',
      expires: '2026-12-01T00:00:00Z',
      login: 'ShenYuanOR',
      now: Date.parse('2026-11-19T00:00:00Z'),
    });
    expect(report).toMatchObject({ status: 'valid', account: 'ShenYuanOR', kind: 'github-classic' });
    expect(report.capabilities.find((item) => item.key === 'hosting')?.label).toBe('开启 Pages');
    expect(requiredMissing(report)).toEqual([]);
    expect(report.capabilities.find((item) => item.key === 'create')?.state).toBe('ok');
  });

  it('经典令牌缺 workflow 时标出缺失，建仓库缺失不算必需失败', () => {
    const report = readGithubVerify({
      status: 200,
      scopes: 'public_repo',
      expires: '',
      login: 'a',
    });
    expect(report.capabilities.find((item) => item.key === 'workflow')?.state).toBe('missing');
    expect(requiredMissing(report).some((item) => item.key === 'create')).toBe(false);
    expect(requiredMissing(report).map((item) => item.key)).toContain('workflow');
  });

  it('没有 scopes 头的细粒度令牌标成未知', () => {
    const report = readGithubVerify({ status: 200, scopes: '', expires: '', login: 'a' });
    expect(report.kind).toBe('github-fine');
    expect(report.capabilities.every((item) => item.state === 'unknown')).toBe(true);
  });

  it('401 和过期都给出明确状态', () => {
    expect(readGithubVerify({ status: 401, scopes: '', expires: '', login: '' }).message).toBe('令牌已失效');
    expect(
      readGithubVerify({
        status: 200,
        scopes: 'repo',
        expires: '2020-01-01T00:00:00Z',
        login: 'a',
        now: Date.parse('2026-11-19T00:00:00Z'),
      }).status,
    ).toBe('expired');
  });

  it('Gitea 只有仓库写权限时不能建仓库', () => {
    const report = readGiteaVerify({
      status: 200,
      scopes: 'write:repository',
      login: 'ShenYuan',
      origin: 'http://gitea.local:3000',
    });
    expect(report.capabilities.find((item) => item.key === 'hosting')?.label).toBe('打开 Actions');
    expect(report.capabilities.find((item) => item.key === 'push')?.state).toBe('ok');
    expect(report.capabilities.find((item) => item.key === 'create')?.state).toBe('missing');
    expect(requiredMissing(report)).toEqual([]);
    expect(readGiteaVerify({ status: 401, scopes: '', login: '', origin: 'http://gitea.local' }).message).toBe(
      '令牌已失效',
    );
  });

  it('同一令牌 60 秒内复用，过期后重查', () => {
    let now = 1_000;
    const cache = createVerifyCache(() => now);
    const key = verifyCacheKey('github', 'https://github.com', 'secret-token');
    const report = readGithubVerify({ status: 401, scopes: '', expires: '', login: '' });
    cache.put(key, report);
    expect(cache.get(key)?.message).toBe('令牌已失效');
    now += 61_000;
    expect(cache.get(key)).toBeNull();
    expect(verifyCacheKey('github', 'https://github.com', 'secret-token')).not.toContain('secret-token');
  });

  it('细粒度令牌只补上探测得到的项', async () => {
    const base = readGithubVerify({ status: 200, scopes: '', expires: '', login: 'a' });
    const fetchImpl = (async (url: string) => {
      if (url.includes('git-receive-pack')) return new Response('', { status: 200 });
      if (url.includes('/actions/runs')) return new Response('{}', { status: 403 });
      return new Response('', { status: 500 });
    }) as typeof fetch;
    const probe = await probeTokenCapabilities({
      provider: 'github',
      remoteUrl: 'https://github.com/a/b.git',
      token: 't',
      fetchImpl,
    });
    const merged = mergeProbe(base, probe);
    expect(merged.capabilities.find((item) => item.key === 'push')?.state).toBe('ok');
    expect(merged.capabilities.find((item) => item.key === 'actions')?.state).toBe('missing');
    expect(merged.capabilities.find((item) => item.key === 'workflow')?.state).toBe('unknown');
    const classic = readGithubVerify({ status: 200, scopes: 'repo, workflow', expires: '', login: 'a' });
    expect(mergeProbe(classic, { push: 'missing' }).capabilities.find((item) => item.key === 'push')?.state).toBe('ok');
  });

  it('缺 workflow 权限的推送失败写成中文', () => {
    expect(explainWorkflowScope('refusing to allow a token to update workflow without workflow scope')).toContain(
      '构建配置',
    );
    expect(explainWorkflowScope('not a fast-forward')).toBe('');
  });
});

describe('网址推导', () => {
  it('普通仓库挂在用户站点下面，github.io 仓库用根路径', () => {
    expect(githubPagesUrl('ShenYuanOR', 'xiao-pages-test')).toEqual({
      siteUrl: 'https://shenyuanor.github.io/xiao-pages-test/',
      base: '/xiao-pages-test/',
    });
    expect(githubPagesUrl('ShenYuanOR', 'ShenYuanOR.github.io')).toEqual({
      siteUrl: 'https://shenyuanor.github.io/',
      base: '/',
    });
  });

  it('Gitea 静态服务按小写 owner/repo 拼路径', () => {
    expect(giteaPagesUrl('http://192.168.1.170:8700/', 'ShenYuan', 'Xiao-Gate')).toEqual({
      siteUrl: 'http://192.168.1.170:8700/shenyuan/xiao-gate/',
      base: '/shenyuan/xiao-gate/',
    });
  });
});
