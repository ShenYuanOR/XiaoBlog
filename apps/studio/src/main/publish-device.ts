/** GitHub App「XiaoBlog Studio」。Client ID 是公开信息，全项目只放这里。 */
export const GITHUB_APP_CLIENT_ID = 'Iv23lilg7wGuy1MoxTV3';

export const GITHUB_APP_INSTALL_URL = 'https://github.com/apps/xiaoblog-studio/installations/new';
export const GITHUB_APP_AUTHORIZATIONS_URL = 'https://github.com/settings/apps/authorizations';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const REFRESH_EARLY_MS = 5 * 60 * 1000;

export const AUTH_EXPIRED = '授权已失效，重新授权';
export const DEVICE_DENIED = '你拒绝了这次授权';
export const DEVICE_CODE_EXPIRED = '授权码过期了，重新授权';
export const DEVICE_CANCELLED = '已取消授权';

export interface GithubGrant {
  kind: 'github-app';
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
  account: string;
}

export type DevicePhase = 'idle' | 'pending' | 'success' | 'denied' | 'expired' | 'cancelled' | 'error';

export interface DeviceView {
  phase: DevicePhase;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
  message: string;
  grant: GithubGrant | null;
}

export function encodeGrant(grant: GithubGrant): string {
  return JSON.stringify(grant);
}

export function decodeGrant(stored: string | null): GithubGrant | null {
  if (!stored) return null;
  try {
    const row = JSON.parse(stored) as Partial<GithubGrant>;
    if (row.kind !== 'github-app' || !row.accessToken || !row.refreshToken) return null;
    if (typeof row.accessExpiresAt !== 'number' || typeof row.refreshExpiresAt !== 'number') return null;
    return {
      kind: 'github-app',
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      accessExpiresAt: row.accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
      account: typeof row.account === 'string' ? row.account : '',
    };
  } catch {
    return null;
  }
}

/** 旧版手动令牌不是 App 授权。 */
export function isLegacyToken(stored: string | null): boolean {
  return Boolean(stored) && decodeGrant(stored) === null;
}

export function shouldRefresh(grant: GithubGrant, now: number): boolean {
  return grant.accessExpiresAt - now <= REFRESH_EARLY_MS;
}

function idleView(): DeviceView {
  return { phase: 'idle', userCode: '', verificationUri: '', expiresAt: 0, interval: 5, message: '', grant: null };
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function githubJsonInit(body: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function grantFromTokenBody(body: Record<string, unknown>, now: number, account: string): GithubGrant | null {
  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
  const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
  if (!accessToken || !refreshToken) return null;
  const accessIn = typeof body.expires_in === 'number' ? body.expires_in : 28_800;
  const refreshIn = typeof body.refresh_token_expires_in === 'number' ? body.refresh_token_expires_in : 15_638_400;
  return {
    kind: 'github-app',
    accessToken,
    refreshToken,
    accessExpiresAt: now + accessIn * 1000,
    refreshExpiresAt: now + refreshIn * 1000,
    account,
  };
}

export type DevicePoll =
  | { kind: 'pending'; interval: number }
  | { kind: 'slow_down'; interval: number }
  | { kind: 'expired'; message: string }
  | { kind: 'denied'; message: string }
  | { kind: 'success'; grant: GithubGrant }
  | { kind: 'error'; message: string };

/** 轮询结果。slow_down 把当前间隔加 5 秒。 */
export function readDevicePoll(body: unknown, interval: number, now: number): DevicePoll {
  const row = asRecord(body);
  const error = typeof row.error === 'string' ? row.error : '';
  if (error === 'authorization_pending') return { kind: 'pending', interval };
  if (error === 'slow_down') return { kind: 'slow_down', interval: interval + 5 };
  if (error === 'expired_token') return { kind: 'expired', message: DEVICE_CODE_EXPIRED };
  if (error === 'access_denied') return { kind: 'denied', message: DEVICE_DENIED };
  if (error) return { kind: 'error', message: '授权没有完成' };
  const grant = grantFromTokenBody(row, now, '');
  if (!grant) return { kind: 'error', message: '授权没有完成' };
  return { kind: 'success', grant };
}

export async function refreshGithubGrant(input: {
  grant: GithubGrant;
  fetchImpl: typeof fetch;
  now: number;
}): Promise<{ ok: true; grant: GithubGrant } | { ok: false; message: string }> {
  if (input.grant.refreshExpiresAt <= input.now) return { ok: false, message: AUTH_EXPIRED };
  let response: Response;
  try {
    response = await input.fetchImpl(
      ACCESS_TOKEN_URL,
      githubJsonInit({
        client_id: GITHUB_APP_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: input.grant.refreshToken,
      }),
    );
  } catch {
    return { ok: false, message: '连不上 GitHub' };
  }
  const body = asRecord(await readJson(response));
  if (!response.ok || typeof body.error === 'string') return { ok: false, message: AUTH_EXPIRED };
  const grant = grantFromTokenBody(body, input.now, input.grant.account);
  if (!grant) return { ok: false, message: AUTH_EXPIRED };
  return { ok: true, grant };
}

export async function ensureFreshGrant(input: {
  grant: GithubGrant;
  fetchImpl: typeof fetch;
  now: number;
}): Promise<{ ok: true; grant: GithubGrant; changed: boolean } | { ok: false; message: string }> {
  if (input.grant.refreshExpiresAt <= input.now) return { ok: false, message: AUTH_EXPIRED };
  if (!shouldRefresh(input.grant, input.now)) return { ok: true, grant: input.grant, changed: false };
  const next = await refreshGithubGrant(input);
  if (!next.ok) return next;
  return { ok: true, grant: next.grant, changed: true };
}

/** Bearer 请求。快过期或 401 时刷新一次，并带回新的刷新令牌。 */
export async function githubAuthorizedFetch(input: {
  grant: GithubGrant;
  url: string;
  init?: RequestInit;
  fetchImpl: typeof fetch;
  now: number;
}): Promise<{ response: Response | null; grant: GithubGrant; changed: boolean; message: string }> {
  const fresh = await ensureFreshGrant(input);
  if (!fresh.ok) return { response: null, grant: input.grant, changed: false, message: fresh.message };
  const send = (grant: GithubGrant): Promise<Response> => {
    const headers = new Headers(input.init?.headers);
    headers.set('Authorization', `Bearer ${grant.accessToken}`);
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    headers.set('User-Agent', 'XiaoBlog');
    return input.fetchImpl(input.url, { ...input.init, headers });
  };
  try {
    const response = await send(fresh.grant);
    if (response.status !== 401) {
      return { response, grant: fresh.grant, changed: fresh.changed, message: '' };
    }
    await response.body?.cancel().catch(() => undefined);
  } catch {
    return { response: null, grant: fresh.grant, changed: fresh.changed, message: '连不上 GitHub' };
  }
  const rotated = await refreshGithubGrant({ grant: fresh.grant, fetchImpl: input.fetchImpl, now: input.now });
  if (!rotated.ok) return { response: null, grant: fresh.grant, changed: fresh.changed, message: rotated.message };
  try {
    const response = await send(rotated.grant);
    return { response, grant: rotated.grant, changed: true, message: '' };
  } catch {
    return { response: null, grant: rotated.grant, changed: true, message: '连不上 GitHub' };
  }
}

async function readAccount(token: string, fetchImpl: typeof fetch): Promise<string> {
  try {
    const response = await fetchImpl('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'XiaoBlog',
      },
    });
    if (!response.ok) return '';
    const body = asRecord(await readJson(response));
    return typeof body.login === 'string' ? body.login : '';
  } catch {
    return '';
  }
}

/** 设备授权。拿到授权码后回调一次，然后按间隔轮询，直到成功、拒绝、过期或取消。 */
export async function runDeviceFlow(input: {
  fetchImpl: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  shouldStop: () => boolean;
  onView: (view: DeviceView) => void;
}): Promise<DeviceView> {
  const fail = (message: string): DeviceView => {
    const view = { ...idleView(), phase: 'error' as const, message };
    input.onView(view);
    return view;
  };
  let started: Response;
  try {
    started = await input.fetchImpl(DEVICE_CODE_URL, githubJsonInit({ client_id: GITHUB_APP_CLIENT_ID }));
  } catch {
    return fail('连不上 GitHub');
  }
  const startBody = asRecord(await readJson(started));
  const deviceCode = typeof startBody.device_code === 'string' ? startBody.device_code : '';
  const userCode = typeof startBody.user_code === 'string' ? startBody.user_code : '';
  const verificationUri = typeof startBody.verification_uri === 'string' ? startBody.verification_uri : '';
  const expiresIn = typeof startBody.expires_in === 'number' ? startBody.expires_in : 0;
  const interval = typeof startBody.interval === 'number' ? startBody.interval : 5;
  if (!started.ok || !deviceCode || !userCode || !verificationUri) return fail('GitHub 没有发回授权码');
  const expiresAt = input.now() + expiresIn * 1000;
  let wait = Math.max(1, interval);
  const pending: DeviceView = {
    phase: 'pending',
    userCode,
    verificationUri,
    expiresAt,
    interval: wait,
    message: '',
    grant: null,
  };
  input.onView(pending);
  while (input.now() < expiresAt) {
    if (input.shouldStop()) {
      const view = { ...pending, phase: 'cancelled' as const, message: DEVICE_CANCELLED };
      input.onView(view);
      return view;
    }
    await input.sleep(wait * 1000);
    if (input.shouldStop()) {
      const view = { ...pending, phase: 'cancelled' as const, message: DEVICE_CANCELLED };
      input.onView(view);
      return view;
    }
    let polled: Response;
    try {
      polled = await input.fetchImpl(
        ACCESS_TOKEN_URL,
        githubJsonInit({
          client_id: GITHUB_APP_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      );
    } catch {
      return fail('连不上 GitHub');
    }
    const step = readDevicePoll(await readJson(polled), wait, input.now());
    if (step.kind === 'pending') continue;
    if (step.kind === 'slow_down') {
      wait = step.interval;
      input.onView({ ...pending, interval: wait });
      continue;
    }
    if (step.kind === 'success') {
      const account = await readAccount(step.grant.accessToken, input.fetchImpl);
      const grant = { ...step.grant, account };
      const view: DeviceView = { ...pending, phase: 'success', message: '', grant };
      input.onView(view);
      return view;
    }
    const phase = step.kind === 'denied' ? 'denied' : step.kind === 'expired' ? 'expired' : 'error';
    const view: DeviceView = { ...pending, phase, message: step.message, grant: null };
    input.onView(view);
    return view;
  }
  const view: DeviceView = { ...pending, phase: 'expired', message: DEVICE_CODE_EXPIRED };
  input.onView(view);
  return view;
}
