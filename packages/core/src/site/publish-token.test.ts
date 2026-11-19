import { describe, expect, it } from 'vitest';
import {
  assessGithubToken,
  createVerifyCache,
  explainOrgFineToken,
  explainWorkflowScope,
  githubFineTokenLink,
  seesOtherRepos,
  githubPagesUrl,
  mergeProbe,
  probeTokenCapabilities,
  reuseTokenOn,
  readGithubVerify,
  tokenExpiryText,
  tokenKindLabel,
  tokenStatusLine,
  verifyCacheKey,
} from '../../../../apps/studio/src/main/publish-token.ts';

describe('令牌验证', () => {
  it('经典令牌不通过', () => {
    const report = readGithubVerify({
      status: 200,
      scopes: 'repo, workflow',
      expires: '',
      login: 'ShenYuanOR',
    });
    expect(report.status).toBe('rejected');
    expect(report.kind).toBe('github-classic');
    expect(report.message).toContain('经典令牌');
    expect(tokenStatusLine(report)).toBe('令牌权限过大');
  });

  it('能访问别的仓库就不通过', () => {
    expect(seesOtherRepos(['ShenYuanOR/xiao-pages-test'], 'ShenYuanOR', 'xiao-pages-test', false)).toBe(false);
    expect(seesOtherRepos(['ShenYuanOR/xiao-pages-test', 'ShenYuanOR/XiaoBlog'], 'ShenYuanOR', 'xiao-pages-test', false)).toBe(
      true,
    );
    expect(seesOtherRepos(['ShenYuanOR/xiao-pages-test'], 'ShenYuanOR', 'xiao-pages-test', true)).toBe(true);
  });

  it('组织禁止细粒度令牌时改写成中文', () => {
    expect(explainOrgFineToken(403, 'fine-grained personal access tokens are disabled', 'ShenYuanOR')).toContain(
      '组织 ShenYuanOR 没有允许细粒度令牌',
    );
    expect(explainOrgFineToken(404, 'missing', 'ShenYuanOR')).toBe('');
  });

  it('没有 scopes 头的细粒度令牌标成未知', () => {
    const report = readGithubVerify({ status: 200, scopes: null, expires: '', login: 'a' });
    expect(report.kind).toBe('github-fine');
    expect(report.status).toBe('valid');
    expect(report.capabilities.every((item) => item.state === 'unknown')).toBe(true);
    expect(report.capabilities.some((item) => item.key === 'workflow')).toBe(true);
  });

  it('401 和过期都给出明确状态', () => {
    expect(readGithubVerify({ status: 401, scopes: null, expires: '', login: '' }).message).toBe('令牌已失效');
    expect(
      readGithubVerify({
        status: 200,
        scopes: null,
        expires: '2020-01-01T00:00:00Z',
        login: 'a',
        now: Date.parse('2026-11-19T00:00:00Z'),
      }).status,
    ).toBe('expired');
  });

  it('进发布页和点发布前不复用，准备流程里可以', () => {
    expect(reuseTokenOn('page')).toBe(false);
    expect(reuseTokenOn('publish')).toBe(false);
    expect(reuseTokenOn('prep')).toBe(true);
  });

  it('准备流程里同一令牌 60 秒内复用，过期后重查', () => {
    let now = 1_000;
    const cache = createVerifyCache(() => now);
    const key = verifyCacheKey('github', 'https://github.com', 'secret-token');
    const report = readGithubVerify({ status: 401, scopes: null, expires: '', login: '' });
    cache.put(key, report);
    expect(cache.get(key)?.message).toBe('令牌已失效');
    now += 61_000;
    expect(cache.get(key)).toBeNull();
    expect(verifyCacheKey('github', 'https://github.com', 'secret-token')).not.toContain('secret-token');
  });

  it('细粒度令牌只补上探测得到的项', async () => {
    const base = readGithubVerify({ status: 200, scopes: null, expires: '', login: 'a' });
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      if (url.includes('git-receive-pack')) return new Response('', { status: 200 });
      if (url.includes('/actions/runs')) return new Response('{}', { status: 403 });
      return new Response('', { status: 500 });
    }) as typeof fetch;
    const probe = await probeTokenCapabilities({
      remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test',
      token: 't',
      fetchImpl,
    });
    expect(seen.some((url) => url.startsWith('https://github.com/ShenYuanOR/xiao-pages-test/info/refs'))).toBe(true);
    expect(seen.some((url) => url.startsWith('https://api.github.com/repos/ShenYuanOR/xiao-pages-test/actions/runs'))).toBe(true);
    const merged = mergeProbe(base, probe);
    expect(merged.capabilities.find((item) => item.key === 'push')?.state).toBe('ok');
    expect(merged.capabilities.find((item) => item.key === 'actions')?.state).toBe('missing');
    expect(merged.capabilities.find((item) => item.key === 'workflow')?.state).toBe('unknown');
    expect(mergeProbe(base, { workflow: 'ok' }).capabilities.find((item) => item.key === 'workflow')?.state).toBe('ok');
  });

  it('只授权目标仓库且能推送才通过', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/user')) {
        return new Response(JSON.stringify({ login: 'ShenYuanOR' }), { status: 200 });
      }
      if (url.includes('/user/repos')) {
        return new Response(JSON.stringify([{ full_name: 'ShenYuanOR/xiao-pages-test' }]), { status: 200 });
      }
      if (url.endsWith('/pages')) return new Response(JSON.stringify({ build_type: 'workflow' }), { status: 200 });
      if (url.includes('git-receive-pack')) return new Response('', { status: 200 });
      if (url.includes('/actions/runs')) return new Response('{}', { status: 200 });
      if (url.includes('/repos/ShenYuanOR/xiao-pages-test')) return new Response('{}', { status: 200 });
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const report = await assessGithubToken({
      token: 'fine',
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      fetchImpl,
    });
    expect(report.status).toBe('valid');
    expect(report.kind).toBe('github-fine');
    expect(report.capabilities.find((item) => item.key === 'push')?.state).toBe('ok');
    expect(report.capabilities.find((item) => item.key === 'workflow')?.state).toBe('unknown');
    expect(githubFineTokenLink('ShenYuanOR', 'xiao-pages-test')).toContain('target_name=ShenYuanOR');
    expect(githubFineTokenLink('ShenYuanOR', 'xiao-pages-test')).toContain('contents=write');
  });

  it('缺 workflow 权限的推送失败写成中文', () => {
    expect(explainWorkflowScope('refusing to allow a token to update workflow without workflow scope')).toContain(
      '构建配置',
    );
    expect(explainWorkflowScope('not a fast-forward')).toBe('');
  });
});

describe('已连接时的令牌短句', () => {
  const now = Date.parse('2026-11-19T00:00:00Z');

  it('失效、将过期、缺权限和有效', () => {
    expect(tokenStatusLine(null)).toBe('还没验证');
    expect(tokenStatusLine(readGithubVerify({ status: 401, scopes: null, expires: '', login: '' }))).toBe('已失效');
    expect(
      tokenStatusLine(
        readGithubVerify({ status: 200, scopes: null, expires: '2020-01-01T00:00:00Z', login: 'a', now }),
        now,
      ),
    ).toBe('已失效');
    expect(
      tokenStatusLine(
        readGithubVerify({ status: 200, scopes: null, expires: '2026-12-01T00:00:00Z', login: 'a', now }),
        now,
      ),
    ).toBe('将在 12 天后过期');
    const missing = readGithubVerify({ status: 200, scopes: null, expires: '', login: 'a' });
    const marked = {
      ...missing,
      capabilities: missing.capabilities.map((item) => (item.key === 'push' ? { ...item, state: 'missing' as const } : item)),
    };
    expect(tokenStatusLine(marked)).toBe('缺少推送内容');
    expect(tokenStatusLine(readGithubVerify({ status: 200, scopes: null, expires: '', login: 'a' }))).toBe('有效');
  });
});

describe('令牌类型和过期', () => {
  it('写出类型，没有过期时间就是不过期', () => {
    expect(tokenKindLabel('github-classic')).toBe('GitHub 经典');
    expect(tokenKindLabel('github-fine')).toBe('GitHub 细粒度');
    expect(tokenExpiryText('')).toBe('不过期');
    expect(tokenExpiryText('2026-12-01T00:00:00Z', Date.parse('2026-11-19T00:00:00Z'))).toBe('将在 12 天后过期');
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

});
