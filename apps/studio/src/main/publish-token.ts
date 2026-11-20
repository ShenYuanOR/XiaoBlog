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
  kind: 'github-classic' | 'github-fine';
  expiresAt: string;
  capabilities: TokenCapability[];
  message: string;
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

export const TOKEN_CHECKLIST = [
  '资源只选这一个仓库，不要选所有仓库',
  'Contents：读写',
  'Workflows：读写',
  'Pages：读写',
  'Actions：只读',
  'Metadata：只读',
];

/** 预填是否生效由协调者实测。页面上同时有清单，预填无效时照着勾。 */
export function githubFineTokenLink(owner: string, repo: string): string {
  const params = new URLSearchParams({
    name: `XiaoBlog ${owner}/${repo}`,
    description: `只用于发布 ${owner}/${repo}`,
    target_name: owner,
    expires_in: '90',
    contents: 'write',
    workflows: 'write',
    pages: 'write',
    actions: 'read',
    metadata: 'read',
  });
  return `https://github.com/settings/personal-access-tokens/new?${params.toString()}`;
}

export function githubTokenLink(owner = '', repo = ''): string {
  if (owner && repo) return githubFineTokenLink(owner, repo);
  return githubFineTokenLink('owner', 'repo');
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
  return '令牌不能修改构建配置。GitHub 需要勾上 workflow（或细粒度令牌的 Workflows 写权限），然后重新连接。';
}

/** 已连接那一行右侧的短句。 */
export function tokenStatusLine(
  report: {
    status: string;
    message?: string;
    expiresAt?: string;
    capabilities?: { key: string; label: string; state: string }[];
  } | null,
  now = Date.now(),
): string {
  if (!report) return '还没验证';
  if (report.status === 'rejected') {
    return /经典|其他私有|写入其他/.test(report.message ?? '') ? '令牌权限过大' : report.message || '令牌权限过大';
  }
  if (report.status === 'invalid' || report.status === 'expired') return '已失效';
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

export function readGithubVerify(input: {
  status: number;
  /** null 表示没有 X-OAuth-Scopes，是细粒度令牌。有这个头就是经典令牌。 */
  scopes: string | null;
  expires: string;
  login: string;
  now?: number;
}): TokenReport {
  const now = input.now ?? Date.now();
  if (input.scopes !== null) {
    return {
      status: 'rejected',
      account: input.login,
      kind: 'github-classic',
      expiresAt: input.expires,
      capabilities: [],
      message: '这是经典令牌，能访问你整个账号',
    };
  }
  if (input.status === 401 || input.status === 403) {
    return {
      status: 'invalid',
      account: '',
      kind: 'github-fine',
      expiresAt: '',
      capabilities: [],
      message: '令牌已失效',
    };
  }
  if (expired(input.expires, now)) {
    return {
      status: 'expired',
      account: input.login,
      kind: 'github-fine',
      expiresAt: input.expires,
      capabilities: [],
      message: '令牌已过期',
    };
  }
  return {
    status: 'valid',
    account: input.login,
    kind: 'github-fine',
    expiresAt: input.expires.trim(),
    capabilities: [
      cap('push', 'unknown', '细粒度令牌要授予这个仓库的 Contents 写。'),
      cap('workflow', 'unknown', 'Workflows 写现在测不出来。推送构建配置被拒时会说明怎么补。'),
      cap('hosting', 'unknown', '读取 Pages 后才能确认。', '开启 Pages'),
      cap('actions', 'unknown', '读取构建记录需要 Actions 读。'),
    ],
    message: '',
  };
}

export interface RepoAccessRow {
  fullName: string;
  private: boolean;
  /** 账号在仓库上的角色，不是令牌能不能推送。 */
  pushRole: boolean;
}

export function readRepoAccessRows(body: unknown): RepoAccessRow[] {
  if (!Array.isArray(body)) return [];
  const rows: RepoAccessRow[] = [];
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { full_name?: string; private?: boolean; permissions?: { push?: boolean } };
    if (!row.full_name) continue;
    rows.push({ fullName: row.full_name, private: row.private === true, pushRole: row.permissions?.push === true });
  }
  return rows;
}

export function otherPrivateNames(rows: RepoAccessRow[], owner: string, repo: string): string[] {
  const target = `${owner}/${repo}`.toLowerCase();
  return rows.filter((item) => item.private && item.fullName.toLowerCase() !== target).map((item) => item.fullName);
}

/** 最多挑两个目标以外、账号有推送角色的公开仓库，用来探测令牌能不能写。 */
export function publicProbeTargets(rows: RepoAccessRow[], owner: string, repo: string, limit = 2): string[] {
  const target = `${owner}/${repo}`.toLowerCase();
  return rows
    .filter((item) => !item.private && item.pushRole && item.fullName.toLowerCase() !== target)
    .slice(0, limit)
    .map((item) => item.fullName);
}

export function explainOrgFineToken(status: number, body: string, owner: string): string {
  if (status !== 403) return '';
  if (/fine-grained|personal access token|resource owner|organization/i.test(body)) {
    return `组织 ${owner} 没有允许细粒度令牌：到组织 Settings → Personal access tokens 打开`;
  }
  return '';
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

function basicAuth(token: string): string {
  return `Basic ${Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64')}`;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'XiaoBlog',
  };
}

export async function verifyGithubToken(token: string, fetchImpl: typeof fetch, now?: number): Promise<TokenReport> {
  const response = await fetchImpl('https://api.github.com/user', { headers: githubHeaders(token) });
  let login = '';
  if (response.ok) {
    const body = (await response.json()) as { login?: string };
    login = body.login ?? '';
  }
  return readGithubVerify({
    status: response.status,
    scopes: response.headers.get('x-oauth-scopes'),
    expires: response.headers.get('github-authentication-token-expiration') ?? '',
    login,
    now,
  });
}

/** 细粒度、且只能访问目标仓库，才算通过。 */
export async function assessGithubToken(input: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl: typeof fetch;
  now?: number;
}): Promise<TokenReport> {
  const headers = githubHeaders(input.token);
  const user = await input.fetchImpl('https://api.github.com/user', { headers });
  const userBody = await user.text();
  const org = explainOrgFineToken(user.status, userBody, input.owner);
  if (org) {
    return {
      status: 'rejected',
      account: '',
      kind: 'github-fine',
      expiresAt: '',
      capabilities: [],
      message: org,
    };
  }
  let login = '';
  if (user.ok) {
    try {
      login = (JSON.parse(userBody) as { login?: string }).login ?? '';
    } catch {
      login = '';
    }
  }
  const base = readGithubVerify({
    status: user.status,
    scopes: user.headers.get('x-oauth-scopes'),
    expires: user.headers.get('github-authentication-token-expiration') ?? '',
    login,
    now: input.now,
  });
  if (base.status !== 'valid') return base;
  const privateList = await input.fetchImpl(
    'https://api.github.com/user/repos?visibility=private&per_page=100&affiliation=owner,collaborator,organization_member',
    { headers },
  );
  if (privateList.ok) {
    const privateRows = readRepoAccessRows(await privateList.json());
    const morePrivate = (privateList.headers.get('link') ?? '').includes('rel="next"');
    if (morePrivate || otherPrivateNames(privateRows, input.owner, input.repo).length > 0) {
      return { ...base, status: 'rejected', message: '这个令牌能访问其他私有仓库' };
    }
  }
  const publicList = await input.fetchImpl(
    'https://api.github.com/user/repos?visibility=public&per_page=100&affiliation=owner,collaborator,organization_member',
    { headers },
  );
  const probes = publicList.ok ? publicProbeTargets(readRepoAccessRows(await publicList.json()), input.owner, input.repo) : [];
  for (const fullName of probes) {
    const [probeOwner, probeRepo] = fullName.split('/');
    if (!probeOwner || !probeRepo) continue;
    const writable = await input.fetchImpl(
      `https://github.com/${probeOwner}/${probeRepo}.git/info/refs?service=git-receive-pack`,
      { headers: { Authorization: basicAuth(input.token), 'User-Agent': 'XiaoBlog' } },
    );
    if (writable.status === 200) {
      return { ...base, status: 'rejected', message: '这个令牌能写入其他仓库' };
    }
  }
  const repoResponse = await input.fetchImpl(`https://api.github.com/repos/${input.owner}/${input.repo}`, { headers });
  if (repoResponse.status !== 200) {
    return { ...base, status: 'rejected', message: '令牌看不到这个仓库。' };
  }
  const probe = await probeTokenCapabilities({
    remoteUrl: `https://github.com/${input.owner}/${input.repo}`,
    token: input.token,
    login,
    fetchImpl: input.fetchImpl,
  });
  const pages = await input.fetchImpl(`https://api.github.com/repos/${input.owner}/${input.repo}/pages`, { headers });
  const merged = mergeProbe(base, { ...probe, hosting: readProbeStatus(pages.status) });
  if (probe.push !== 'ok') {
    return { ...merged, status: 'rejected', message: '令牌不能推送到这个仓库。' };
  }
  return merged;
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
}): Promise<Partial<Record<CapabilityKey, CapabilityState>>> {
  const remote = parseRemote(input.remoteUrl);
  if (!remote) return {};
  const out: Partial<Record<CapabilityKey, CapabilityState>> = {};
  const login = input.login?.trim() || 'x-access-token';
  const basic = `Basic ${Buffer.from(`${login}:${input.token}`, 'utf8').toString('base64')}`;
  try {
    const push = await input.fetchImpl(`${input.remoteUrl.replace(/\/$/, '')}/info/refs?service=git-receive-pack`, {
      headers: { Authorization: basic, 'User-Agent': 'XiaoBlog' },
    });
    out.push = readProbeStatus(push.status);
  } catch {
    out.push = 'unknown';
  }
  try {
    const actionsUrl = `https://api.github.com/repos/${remote.owner}/${remote.repo}/actions/runs?per_page=1`;
    const headers = {
      Authorization: `Bearer ${input.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'XiaoBlog',
    };
    const actions = await input.fetchImpl(actionsUrl, { headers });
    out.actions = readProbeStatus(actions.status);
  } catch {
    out.actions = 'unknown';
  }
  return out;
}

export function verifyCacheKey(provider: string, origin: string, token: string): string {
  let hash = 0;
  for (const char of token) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return `${provider}|${origin}|${hash.toString(16)}`;
}
