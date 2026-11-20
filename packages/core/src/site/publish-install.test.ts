import { describe, expect, it } from 'vitest';
import type { GithubGrant } from '../../../../apps/studio/src/main/publish-device.ts';
import {
  checkInstallation,
  installationSettingsUrl,
  interpretInstallScope,
} from '../../../../apps/studio/src/main/publish-install.ts';

const NOW = Date.parse('2026-11-20T00:00:00Z');
const grant: GithubGrant = {
  kind: 'github-app',
  accessToken: 'ghu_test',
  refreshToken: 'ghr_test',
  accessExpiresAt: NOW + 8 * 60 * 60 * 1000,
  refreshExpiresAt: NOW + 86_400_000,
  account: 'ShenYuanOL',
};

function install(selection: string, login = 'ShenYuanOR', type = 'Organization') {
  return {
    installations: [
      {
        id: 42,
        repository_selection: selection,
        account: { login, type },
      },
    ],
  };
}

describe('安装范围', () => {
  it('没有安装、装到所有仓库、没包含目标、还装了别的仓库', () => {
    expect(interpretInstallScope({ rows: [], repoNames: [], hasMore: false, owner: 'ShenYuanOR', repo: 'xiao-pages-test' })).toMatchObject({
      message: '先把 XiaoBlog Studio 安装到这个仓库',
      link: 'https://github.com/apps/xiaoblog-studio/installations/new',
    });
    const all = interpretInstallScope({
      rows: [{ id: 42, login: 'ShenYuanOR', accountType: 'Organization', selection: 'all' }],
      repoNames: [],
      hasMore: false,
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
    });
    expect(all.ok).toBe(false);
    if (all.ok) return;
    expect(all.message).toContain('所有仓库');
    expect(all.link).toBe('https://github.com/organizations/ShenYuanOR/settings/installations/42');
    expect(installationSettingsUrl('ShenYuanOL', 7, 'User')).toBe('https://github.com/settings/installations/7');
    const missing = interpretInstallScope({
      rows: [{ id: 42, login: 'ShenYuanOR', accountType: 'Organization', selection: 'selected' }],
      repoNames: ['ShenYuanOR/other'],
      hasMore: false,
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.message).toContain('加入安装');
    const extra = interpretInstallScope({
      rows: [{ id: 42, login: 'ShenYuanOR', accountType: 'Organization', selection: 'selected' }],
      repoNames: ['ShenYuanOR/xiao-pages-test', 'ShenYuanOR/XiaoBlog'],
      hasMore: false,
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
    });
    expect(extra.ok).toBe(false);
    if (extra.ok) return;
    expect(extra.message).toContain('只选 ShenYuanOR/xiao-pages-test');
  });

  it('只选目标仓库且能推送时通过，空的 scopes 头不影响', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/user/installations')) {
        return new Response(JSON.stringify(install('selected')), {
          status: 200,
          headers: { 'X-OAuth-Scopes': '' },
        });
      }
      if (url.includes('/installations/42/repositories')) {
        return new Response(JSON.stringify({ repositories: [{ full_name: 'ShenYuanOR/xiao-pages-test' }] }), { status: 200 });
      }
      if (url.includes('git-receive-pack')) return new Response('', { status: 200 });
      if (url.includes('/actions/runs')) return new Response('{}', { status: 200 });
      if (url.endsWith('/pages')) return new Response(JSON.stringify({ build_type: 'workflow' }), { status: 200 });
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const result = await checkInstallation({
      grant,
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      fetchImpl,
      now: NOW,
    });
    expect(result.status).toBe('valid');
    expect(result.report.capabilities.find((item) => item.key === 'workflow')).toMatchObject({ state: 'ok' });
    expect(result.report.capabilities.find((item) => item.key === 'hosting')?.how).toBe('已开启');
    expect(result.report.capabilities.find((item) => item.key === 'push')?.state).toBe('ok');
    const closed = await checkInstallation({
      grant,
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      now: NOW,
      fetchImpl: (async (url: string) => {
        if (url.endsWith('/pages')) return new Response('', { status: 404 });
        return fetchImpl(url);
      }) as typeof fetch,
    });
    expect(closed.report.capabilities.find((item) => item.key === 'hosting')?.how).toContain('网页设置');
  });
});
