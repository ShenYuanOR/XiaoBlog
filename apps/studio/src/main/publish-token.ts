export type CapabilityKey = 'push' | 'workflow' | 'hosting' | 'actions' | 'create';
export type CapabilityState = 'ok' | 'missing' | 'unknown';

export interface TokenCapability {
  key: CapabilityKey;
  label: string;
  state: CapabilityState;
  /** 缺了或不肯定时，告诉用户去哪补。够了就空着。 */
  how: string;
}

export interface TokenReport {
  status: 'valid' | 'invalid' | 'expired' | 'rejected';
  account: string;
  kind: 'github-classic' | 'github-fine' | 'github-app';
  expiresAt: string;
  capabilities: TokenCapability[];
  message: string;
  link?: string;
}

const LABELS: Record<CapabilityKey, string> = {
  push: '推送内容',
  workflow: '修改构建配置',
  hosting: '开启网站托管',
  actions: '读取构建记录',
  create: '新建仓库',
};

function cap(key: CapabilityKey, state: CapabilityState, how = '', label = LABELS[key]): TokenCapability {
  return { key, label, state, how: state === 'ok' ? '' : how };
}

function expired(header: string, now: number): boolean {
  if (!header.trim()) return false;
  const time = Date.parse(header);
  return Number.isFinite(time) && time <= now;
}

/** GitHub 仓库对应的 Pages 网址。`owner.github.io` 这个仓库本身是根路径。 */
export function githubPagesUrl(owner: string, repo: string): { siteUrl: string; base: string } {
  const host = owner.trim().toLowerCase();
  const name = repo.trim().replace(/\.git$/, '');
  if (name.toLowerCase() === `${host}.github.io`) {
    return { siteUrl: `https://${host}.github.io/`, base: '/' };
  }
  return { siteUrl: `https://${host}.github.io/${name}/`, base: `/${name}/` };
}

export function githubNewRepoLink(owner: string, name: string): string {
  const params = new URLSearchParams({ visibility: 'public' });
  if (owner.trim()) params.set('owner', owner.trim());
  if (name.trim()) params.set('name', name.trim());
  return `https://github.com/new?${params.toString()}`;
}

export function githubPagesSettingsLink(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/settings/pages`;
}

/** 推送构建配置被 GitHub 拒绝时的中文。对不上就返回空串。 */
export function explainWorkflowScope(message: string): string {
  if (!/workflow/i.test(message)) return '';
  return '令牌没有修改构建配置的权限。到 GitHub 的令牌设置里给 Workflows 加上读写权限，保存后点「重试」。';
}

/** 已连接那一行右侧的短句。 */
export function tokenStatusLine(
  report: {
    status: string;
    message?: string;
    account?: string;
    kind?: string;
    expiresAt?: string;
    capabilities?: { key: string; label: string; state: string }[];
  } | null,
  now = Date.now(),
): string {
  if (!report) return '还没验证';
  if (report.status === 'rejected' || report.status === 'invalid' || report.status === 'expired') {
    return report.message || '授权已失效，重新授权';
  }
  if (report.kind === 'github-app') return report.account ? `已授权 · ${report.account}` : '已授权';
  const missing = (report.capabilities ?? []).find((item) => item.key !== 'create' && item.state === 'missing');
  if (missing) return `缺少${missing.label}`;
  const expires = Date.parse(report.expiresAt ?? '');
  if (Number.isFinite(expires) && expires > now) {
    const days = Math.max(1, Math.ceil((expires - now) / 86_400_000));
    return `将在 ${days} 天后过期`;
  }
  return '有效';
}

export function tokenKindLabel(kind: string): string {
  if (kind === 'github-classic') return 'GitHub 经典';
  if (kind === 'github-fine') return 'GitHub 细粒度';
  if (kind === 'github-app') return 'GitHub App';
  return '令牌';
}

export function tokenExpiryText(expiresAt: string, now = Date.now()): string {
  const text = expiresAt.trim();
  if (!text) return '不过期';
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return '不过期';
  if (time <= now) return '已过期';
  const days = Math.max(1, Math.ceil((time - now) / 86_400_000));
  return `将在 ${days} 天后过期`;
}

export function requiredMissing(report: TokenReport): TokenCapability[] {
  return report.capabilities.filter((item) => item.key !== 'create' && item.state === 'missing');
}

/** 只有准备流程里同一步可以复用。进发布页和点发布前都要重新问。 */
export function reuseTokenOn(surface: 'prep' | 'page' | 'publish'): boolean {
  return surface === 'prep';
}

/** 准备流程内部 60 秒内复用。键里不放令牌原文。 */
export function createVerifyCache(now: () => number): {
  get: (key: string) => TokenReport | null;
  put: (key: string, value: TokenReport) => void;
} {
  const rows = new Map<string, { at: number; value: TokenReport }>();
  return {
    get(key: string): TokenReport | null {
      const row = rows.get(key);
      if (!row || now() - row.at > 60_000) return null;
      return row.value;
    },
    put(key: string, value: TokenReport): void {
      rows.set(key, { at: now(), value });
    },
  };
}

const DEFAULT_TOKEN_CHECK_MS = 8_000;

async function githubCall(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response | null> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }
}

async function releaseBody(response: Response | null): Promise<void> {
  if (!response?.body) return;
  try {
    await response.body.cancel();
  } catch {
    // 用不到正文时把连接放开。
  }
}

/** 只把还不确定的项改成探测结果。scopes 已经标明的不改。 */
export function mergeProbe(
  report: TokenReport,
  probe: Partial<Record<CapabilityKey, CapabilityState>>,
): TokenReport {
  if (report.status !== 'valid') return report;
  return {
    ...report,
    capabilities: report.capabilities.map((item) => {
      const next = probe[item.key];
      if (!next || item.state !== 'unknown') return item;
      return { ...item, state: next, how: next === 'ok' ? '' : item.how };
    }),
  };
}

export function readProbeStatus(status: number): CapabilityState {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'missing';
  return 'unknown';
}

/** 读 Pages 只能说明现在开没开，不能当成令牌有没有改设置的权限。 */
export function pagesCapability(status: number, buildType: string): { state: CapabilityState; how: string } {
  if (status === 200 && buildType === 'workflow') return { state: 'ok', how: '已开启' };
  return { state: 'unknown', how: '首次开启需要在网页设置' };
}

function parseRemote(remoteUrl: string): { origin: string; owner: string; repo: string } | null {
  try {
    const url = new URL(remoteUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    const repo = (parts.at(-1) ?? '').replace(/\.git$/, '');
    const owner = parts.at(-2) ?? '';
    if (!owner || !repo) return null;
    return { origin: url.origin, owner, repo };
  } catch {
    return null;
  }
}

/** 仓库已知时，用 receive-pack 测推送，用构建记录接口测读取。测不了就保持未知。 */
export async function probeTokenCapabilities(input: {
  remoteUrl: string;
  token: string;
  login?: string;
  fetchImpl: typeof fetch;
  timeoutMs?: number;
}): Promise<Partial<Record<CapabilityKey, CapabilityState>> & { pushAnswered: boolean }> {
  const remote = parseRemote(input.remoteUrl);
  if (!remote) return { pushAnswered: false };
  const timeoutMs = input.timeoutMs ?? DEFAULT_TOKEN_CHECK_MS;
  const login = input.login?.trim() || 'x-access-token';
  const basic = `Basic ${Buffer.from(`${login}:${input.token}`, 'utf8').toString('base64')}`;
  const actionHeaders = {
    Authorization: `Bearer ${input.token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'XiaoBlog',
  };
  const [push, actions] = await Promise.all([
    githubCall(
      input.fetchImpl,
      `${input.remoteUrl.replace(/\/$/, '')}/info/refs?service=git-receive-pack`,
      { headers: { Authorization: basic, 'User-Agent': 'XiaoBlog' } },
      timeoutMs,
    ),
    githubCall(
      input.fetchImpl,
      `https://api.github.com/repos/${remote.owner}/${remote.repo}/actions/runs?per_page=1`,
      { headers: actionHeaders },
      timeoutMs,
    ),
  ]);
  const out: Partial<Record<CapabilityKey, CapabilityState>> & { pushAnswered: boolean } = {
    push: push ? readProbeStatus(push.status) : 'unknown',
    actions: actions ? readProbeStatus(actions.status) : 'unknown',
    pushAnswered: push !== null,
  };
  await releaseBody(push);
  await releaseBody(actions);
  return out;
}

export function verifyCacheKey(provider: string, origin: string, token: string): string {
  let hash = 0;
  for (const char of token) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return `${provider}|${origin}|${hash.toString(16)}`;
}
