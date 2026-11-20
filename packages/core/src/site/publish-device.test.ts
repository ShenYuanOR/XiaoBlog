import { describe, expect, it } from 'vitest';
import {
  AUTH_EXPIRED,
  DEVICE_CANCELLED,
  DEVICE_CODE_EXPIRED,
  DEVICE_DENIED,
  GITHUB_APP_CLIENT_ID,
  decodeGrant,
  encodeGrant,
  githubAuthorizedFetch,
  readDevicePoll,
  refreshGithubGrant,
  runDeviceFlow,
  shouldRefresh,
  type GithubGrant,
} from '../../../../apps/studio/src/main/publish-device.ts';

const NOW = Date.parse('2026-11-20T00:00:00Z');

function deviceCodeResponse(): Response {
  return new Response(
    JSON.stringify({
      device_code: 'device-1',
      user_code: '1102-B155',
      verification_uri: 'https://github.com/login/device',
      expires_in: 899,
      interval: 5,
    }),
    { status: 200 },
  );
}

function tokenResponse(access: string, refresh: string): Response {
  return new Response(
    JSON.stringify({
      access_token: access,
      expires_in: 28800,
      refresh_token: refresh,
      refresh_token_expires_in: 15638400,
      scope: '',
    }),
    { status: 200 },
  );
}

describe('设备授权', () => {
  it('等待中会继续轮询，成功后带上账号，请求里没有 client secret', async () => {
    const bodies: string[] = [];
    const sleeps: number[] = [];
    const phases: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      bodies.push(String(init?.body ?? ''));
      if (url.endsWith('/device/code')) return deviceCodeResponse();
      if (url.endsWith('/user')) return new Response(JSON.stringify({ login: 'ShenYuanOL' }), { status: 200 });
      if (bodies.filter((body) => body.includes('device_code')).length === 1) {
        return new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 200 });
      }
      return tokenResponse('ghu_new', 'ghr_new');
    }) as typeof fetch;
    const view = await runDeviceFlow({
      fetchImpl,
      now: () => NOW,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      shouldStop: () => false,
      onView: (next) => phases.push(next.phase),
    });
    expect(phases).toContain('pending');
    expect(view.phase).toBe('success');
    expect(view.userCode).toBe('1102-B155');
    expect(view.grant?.account).toBe('ShenYuanOL');
    expect(view.grant?.refreshToken).toBe('ghr_new');
    expect(sleeps).toEqual([5000, 5000]);
    expect(bodies.every((body) => !body.includes('client_secret'))).toBe(true);
    expect(bodies.some((body) => body.includes(GITHUB_APP_CLIENT_ID))).toBe(true);
    expect(GITHUB_APP_CLIENT_ID).toBe('Iv23lilg7wGuy1MoxTV3');
  });

  it('slow_down 把间隔加 5 秒', async () => {
    const sleeps: number[] = [];
    let polls = 0;
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/device/code')) return deviceCodeResponse();
      if (url.endsWith('/user')) return new Response(JSON.stringify({ login: 'ShenYuanOL' }), { status: 200 });
      polls += 1;
      if (polls === 1) return new Response(JSON.stringify({ error: 'slow_down' }), { status: 200 });
      return tokenResponse('ghu_new', 'ghr_new');
    }) as typeof fetch;
    const view = await runDeviceFlow({
      fetchImpl,
      now: () => NOW,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      shouldStop: () => false,
      onView: () => undefined,
    });
    expect(view.phase).toBe('success');
    expect(sleeps).toEqual([5000, 10_000]);
    expect(readDevicePoll({ error: 'slow_down' }, 5, NOW)).toEqual({ kind: 'slow_down', interval: 10 });
  });

  it('授权码过期、用户拒绝、用户取消', async () => {
    const script = async (error: string) => {
      const fetchImpl = (async (url: string) => {
        if (url.endsWith('/device/code')) return deviceCodeResponse();
        return new Response(JSON.stringify({ error }), { status: 200 });
      }) as typeof fetch;
      return runDeviceFlow({
        fetchImpl,
        now: () => NOW,
        sleep: async () => undefined,
        shouldStop: () => false,
        onView: () => undefined,
      });
    };
    expect((await script('expired_token')).message).toBe(DEVICE_CODE_EXPIRED);
    expect((await script('access_denied')).message).toBe(DEVICE_DENIED);
    const cancelled = await runDeviceFlow({
      fetchImpl: (async (url: string) => {
        if (url.endsWith('/device/code')) return deviceCodeResponse();
        throw new Error('不该再轮询');
      }) as typeof fetch,
      now: () => NOW,
      sleep: async () => undefined,
      shouldStop: () => true,
      onView: () => undefined,
    });
    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.message).toBe(DEVICE_CANCELLED);
  });
});

describe('刷新令牌', () => {
  const grant: GithubGrant = {
    kind: 'github-app',
    accessToken: 'ghu_old',
    refreshToken: 'ghr_old',
    accessExpiresAt: NOW + 60_000,
    refreshExpiresAt: NOW + 86_400_000,
    account: 'ShenYuanOL',
  };

  it('每次刷新都换成新的刷新令牌', async () => {
    const bodies: string[] = [];
    const next = await refreshGithubGrant({
      grant,
      now: NOW,
      fetchImpl: (async (_url: string, init?: RequestInit) => {
        bodies.push(String(init?.body ?? ''));
        return tokenResponse('ghu_next', 'ghr_next');
      }) as typeof fetch,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.grant.refreshToken).toBe('ghr_next');
    expect(next.grant.accessToken).toBe('ghu_next');
    expect(next.grant.account).toBe('ShenYuanOL');
    expect(bodies[0]).toContain('refresh_token');
    expect(bodies[0]).not.toContain('client_secret');
    expect(bodies[0]).not.toContain('ghr_next');
    const stored = decodeGrant(encodeGrant(next.grant));
    expect(stored?.refreshToken).toBe('ghr_next');
  });

  it('刷新失败时要求重新授权', async () => {
    const failed = await refreshGithubGrant({
      grant,
      now: NOW,
      fetchImpl: (async () => new Response(JSON.stringify({ error: 'bad_refresh_token' }), { status: 200 })) as typeof fetch,
    });
    expect(failed).toEqual({ ok: false, message: AUTH_EXPIRED });
    const expired = await refreshGithubGrant({
      grant: { ...grant, refreshExpiresAt: NOW - 1 },
      now: NOW,
      fetchImpl: (async () => {
        throw new Error('不该再请求');
      }) as typeof fetch,
    });
    expect(expired.ok).toBe(false);
  });

  it('剩不到 5 分钟或接口 401 时自动刷新', async () => {
    expect(shouldRefresh(grant, NOW)).toBe(true);
    expect(shouldRefresh({ ...grant, accessExpiresAt: NOW + 6 * 60_000 }, NOW)).toBe(false);
    const seen: string[] = [];
    let apiCalls = 0;
    const result = await githubAuthorizedFetch({
      grant: { ...grant, accessExpiresAt: NOW + 6 * 60_000 },
      url: 'https://api.github.com/user/installations',
      fetchImpl: (async (url: string, init?: RequestInit) => {
        seen.push(url);
        const auth = new Headers(init?.headers).get('authorization') ?? '';
        if (url.includes('access_token')) return tokenResponse('ghu_next', 'ghr_next');
        apiCalls += 1;
        if (apiCalls === 1) {
          expect(auth).toBe('Bearer ghu_old');
          return new Response('', { status: 401 });
        }
        expect(auth).toBe('Bearer ghu_next');
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
      now: NOW,
    });
    expect(result.message).toBe('');
    expect(result.response?.status).toBe(200);
    expect(result.changed).toBe(true);
    expect(result.grant.refreshToken).toBe('ghr_next');
    expect(seen.some((url) => url.includes('access_token'))).toBe(true);
  });
});
