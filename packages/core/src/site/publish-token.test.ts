import { describe, expect, it } from 'vitest';
import {
  createVerifyCache,
  explainWorkflowScope,
  githubPagesUrl,
  mergeProbe,
  pagesCapability,
  probeTokenCapabilities,
  reuseTokenOn,
  tokenExpiryText,
  tokenKindLabel,
  tokenStatusLine,
  verifyCacheKey,
} from '../../../../apps/studio/src/main/publish-token.ts';
import type { TokenReport } from '../../../../apps/studio/src/main/publish-token.ts';

function appReport(partial: Partial<TokenReport> = {}): TokenReport {
  return {
    status: 'valid',
    account: 'ShenYuanOL',
    kind: 'github-app',
    expiresAt: '',
    capabilities: [],
    message: '',
    ...partial,
  };
}

describe('GitHub 授权状态', () => {
  it('进发布页和点发布前不复用', () => {
    expect(reuseTokenOn('page')).toBe(false);
    expect(reuseTokenOn('publish')).toBe(false);
    expect(reuseTokenOn('prep')).toBe(true);
  });

  it('准备流程里同一结果 60 秒内复用', () => {
    let now = 1_000;
    const cache = createVerifyCache(() => now);
    const key = verifyCacheKey('github', 'https://github.com', 'secret-token');
    cache.put(key, appReport({ status: 'invalid', message: '授权已失效，重新授权' }));
    expect(cache.get(key)?.message).toBe('授权已失效，重新授权');
    now += 61_000;
    expect(cache.get(key)).toBeNull();
    expect(key).not.toContain('secret-token');
  });

  it('已授权显示账号，失效显示原因', () => {
    expect(tokenStatusLine(null)).toBe('还没验证');
    expect(tokenStatusLine(appReport())).toBe('已授权 · ShenYuanOL');
    expect(tokenStatusLine(appReport({ status: 'rejected', message: '改用 GitHub 授权' }))).toBe('改用 GitHub 授权');
    expect(tokenKindLabel('github-app')).toBe('GitHub App');
    expect(tokenExpiryText('')).toBe('不过期');
  });

  it('Pages 已开启才这么写', () => {
    expect(pagesCapability(200, 'workflow').how).toBe('已开启');
    expect(pagesCapability(404, '').how).toContain('网页设置');
  });

  it('探测推送和构建记录', async () => {
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
    const merged = mergeProbe(appReport({
      capabilities: [
        { key: 'push', label: '推送内容', state: 'unknown', how: '' },
        { key: 'actions', label: '读取构建记录', state: 'unknown', how: '' },
      ],
    }), probe);
    expect(seen.some((url) => url.includes('git-receive-pack'))).toBe(true);
    expect(merged.capabilities.find((item) => item.key === 'push')?.state).toBe('ok');
    expect(merged.capabilities.find((item) => item.key === 'actions')?.state).toBe('missing');
  });

  it('缺 workflow 权限的推送失败写成中文', () => {
    expect(explainWorkflowScope('refusing to allow a token to update workflow without workflow scope')).toContain('构建配置');
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
});
