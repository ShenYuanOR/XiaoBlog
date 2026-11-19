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
  status: 'valid' | 'invalid' | 'expired';
  account: string;
  kind: 'github-classic' | 'github-fine' | 'gitea';
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

function scopesOf(header: string): Set<string> {
  return new Set(
    header
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
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

export function giteaPagesUrl(staticOrigin: string, owner: string, repo: string): { siteUrl: string; base: string } {
  const root = staticOrigin.trim().replace(/\/$/, '');
  const ownerPath = owner.trim().toLowerCase();
  const repoPath = repo.trim().replace(/\.git$/, '').toLowerCase();
  const base = `/${ownerPath}/${repoPath}/`;
  return { siteUrl: `${root}${base}`, base };
}

export function githubTokenLink(): string {
  return 'https://github.com/settings/tokens/new?scopes=repo,workflow&description=XiaoBlog';
}

export function giteaTokenLink(origin: string): string {
  return `${origin.replace(/\/$/, '')}/user/settings/applications`;
}

export function githubNewRepoLink(owner: string, name: string): string {
  const params = new URLSearchParams({ visibility: 'public' });
  if (owner.trim()) params.set('owner', owner.trim());
  if (name.trim()) params.set('name', name.trim());
  return `https://github.com/new?${params.toString()}`;
}

export function giteaNewRepoLink(origin: string): string {
  return `${origin.replace(/\/$/, '')}/repo/create`;
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
  report: { status: string; expiresAt?: string; capabilities?: { key: string; label: string; state: string }[] } | null,
  now = Date.now(),
): string {
  if (!report) return '还没验证';
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

export function requiredMissing(report: TokenReport): TokenCapability[] {
  return report.capabilities.filter((item) => item.key !== 'create' && item.state === 'missing');
}

export function readGithubVerify(input: {
  status: number;
  scopes: string;
  expires: string;
  login: string;
  now?: number;
}): TokenReport {
  const now = input.now ?? Date.now();
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
      kind: input.scopes.trim() ? 'github-classic' : 'github-fine',
      expiresAt: input.expires,
      capabilities: [],
      message: '令牌已过期',
    };
  }
  const scopes = scopesOf(input.scopes);
  const classic = scopes.size > 0;
  const push = scopes.has('repo') || scopes.has('public_repo');
  const workflow = scopes.has('workflow');
  const how = `去创建令牌：${githubTokenLink()}`;
  const capabilities = classic
    ? [
        cap('push', push ? 'ok' : 'missing', how),
        cap('workflow', workflow ? 'ok' : 'missing', how),
        cap('hosting', push ? 'ok' : 'missing', 'Pages 需要经典令牌的 repo 权限，或细粒度令牌的 Pages 写权限。', '开启 Pages'),
        cap('actions', push ? 'ok' : 'missing', '读取构建记录需要仓库的 Actions 读权限。'),
        cap('create', push ? 'ok' : 'missing', '新建仓库需要能管理所有仓库的权限。没有的话用网页新建即可。'),
      ]
    : [
        cap('push', 'unknown', '细粒度令牌要在这个仓库上授予 Contents 写。'),
        cap('workflow', 'unknown', '细粒度令牌要授予 Workflows 写，才能推送构建配置。'),
        cap('hosting', 'unknown', '开启 Pages 需要 Pages 写或 Administration 写。', '开启 Pages'),
        cap('actions', 'unknown', '读取构建记录需要 Actions 读。'),
        cap('create', 'unknown', '新建仓库需要管理所有仓库。没有的话用网页新建即可。'),
      ];
  return {
    status: 'valid',
    account: input.login,
    kind: classic ? 'github-classic' : 'github-fine',
    expiresAt: input.expires.trim(),
    capabilities,
    message: '',
  };
}

export function readGiteaVerify(input: {
  status: number;
  scopes: string;
  login: string;
  origin: string;
}): TokenReport {
  if (input.status === 401 || input.status === 403) {
    return {
      status: 'invalid',
      account: '',
      kind: 'gitea',
      expiresAt: '',
      capabilities: [],
      message: '令牌已失效',
    };
  }
  const scopes = scopesOf(input.scopes);
  const known = scopes.size > 0;
  const writeRepo = scopes.has('write:repository') || scopes.has('all');
  const writeUser = scopes.has('write:user') || scopes.has('write:organization') || scopes.has('all');
  const how = `去创建令牌：${giteaTokenLink(input.origin)}`;
  const capabilities = known
    ? [
        cap('push', writeRepo ? 'ok' : 'missing', how),
        cap('workflow', writeRepo ? 'ok' : 'missing', how),
        cap('hosting', writeRepo ? 'ok' : 'missing', '打开仓库 Actions 需要仓库写权限。', '打开 Actions'),
        cap('actions', writeRepo ? 'ok' : 'missing', '读取构建记录需要仓库读权限。'),
        cap('create', writeUser ? 'ok' : 'missing', '新建仓库需要 write:user（组织下要 write:organization）。没有的话用网页新建即可。'),
      ]
    : [
        cap('push', 'unknown', ''),
        cap('workflow', 'unknown', ''),
        cap('hosting', 'unknown', '', '打开 Actions'),
        cap('actions', 'unknown', ''),
        cap('create', 'unknown', '不确定能不能建仓库。建不了就用网页新建。'),
      ];
  return {
    status: 'valid',
    account: input.login,
    kind: 'gitea',
    expiresAt: '',
    capabilities,
    message: '',
  };
}

/** 同一令牌 60 秒内复用。键里不放令牌原文。 */
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
    scopes: response.headers.get('x-oauth-scopes') ?? '',
    expires: response.headers.get('github-authentication-token-expiration') ?? '',
    login,
    now,
  });
}

export async function verifyGiteaToken(
  origin: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<TokenReport> {
  const root = origin.replace(/\/$/, '');
  const response = await fetchImpl(`${root}/api/v1/user`, {
    headers: { Authorization: `token ${token}`, 'User-Agent': 'XiaoBlog' },
  });
  let login = '';
  if (response.ok) {
    const body = (await response.json()) as { login?: string };
    login = body.login ?? '';
  }
  return readGiteaVerify({
    status: response.status,
    scopes: response.headers.get('x-oauth-scopes') ?? '',
    login,
    origin: root,
  });
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
  provider: 'github' | 'gitea';
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
    const actionsUrl =
      input.provider === 'github'
        ? `https://api.github.com/repos/${remote.owner}/${remote.repo}/actions/runs?per_page=1`
        : `${remote.origin}/api/v1/repos/${remote.owner}/${remote.repo}/actions/runs?limit=1`;
    const headers =
      input.provider === 'github'
        ? {
            Authorization: `Bearer ${input.token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'XiaoBlog',
          }
        : { Authorization: `token ${input.token}`, 'User-Agent': 'XiaoBlog' };
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
