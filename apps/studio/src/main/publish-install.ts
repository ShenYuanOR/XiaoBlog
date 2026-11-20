import { GITHUB_APP_INSTALL_URL, githubAuthorizedFetch, type GithubGrant } from './publish-device.ts';
import { pagesCapability, type TokenCapability, type TokenReport } from './publish-token.ts';

export interface InstallationRow {
  id: number;
  login: string;
  accountType: string;
  selection: string;
}

export function installationSettingsUrl(owner: string, id: number, accountType: string): string {
  if (accountType.toLowerCase() === 'organization') {
    return `https://github.com/organizations/${owner}/settings/installations/${id}`;
  }
  return `https://github.com/settings/installations/${id}`;
}

export function readInstallations(body: unknown): InstallationRow[] {
  const root = body && typeof body === 'object' ? (body as { installations?: unknown }).installations : null;
  if (!Array.isArray(root)) return [];
  const rows: InstallationRow[] = [];
  for (const item of root) {
    if (!item || typeof item !== 'object') continue;
    const row = item as {
      id?: number;
      repository_selection?: string;
      account?: { login?: string; type?: string };
    };
    if (!row.id || !row.account?.login) continue;
    rows.push({
      id: row.id,
      login: row.account.login,
      accountType: row.account.type ?? 'User',
      selection: row.repository_selection ?? '',
    });
  }
  return rows;
}

export function readInstallationRepos(body: unknown): string[] {
  const root = body && typeof body === 'object' ? (body as { repositories?: unknown }).repositories : null;
  if (!Array.isArray(root)) return [];
  const names: string[] = [];
  for (const item of root) {
    if (!item || typeof item !== 'object') continue;
    const name = (item as { full_name?: string }).full_name;
    if (name) names.push(name);
  }
  return names;
}

/** 只接受「只选中目标仓库」的安装。空的 X-OAuth-Scopes 与这里无关。 */
export function interpretInstallScope(input: {
  rows: InstallationRow[];
  repoNames: string[];
  hasMore: boolean;
  owner: string;
  repo: string;
}): { ok: true } | { ok: false; message: string; link: string } {
  const owner = input.owner.trim();
  const repo = input.repo.trim();
  const target = `${owner}/${repo}`.toLowerCase();
  const match = input.rows.find((row) => row.login.toLowerCase() === owner.toLowerCase());
  if (!match) {
    return { ok: false, message: '先把 XiaoBlog Studio 安装到这个仓库', link: GITHUB_APP_INSTALL_URL };
  }
  const link = installationSettingsUrl(match.login, match.id, match.accountType);
  if (match.selection === 'all') {
    return { ok: false, message: 'XiaoBlog Studio 被安装到了所有仓库，请改成只选这个仓库', link };
  }
  const names = input.repoNames.map((name) => name.toLowerCase());
  if (!names.includes(target)) return { ok: false, message: `把 ${owner}/${repo} 加入安装`, link };
  if (input.hasMore || names.some((name) => name !== target)) {
    return { ok: false, message: `XiaoBlog Studio 还安装了其他仓库，请改成只选 ${owner}/${repo}`, link };
  }
  return { ok: true };
}

function rejected(grant: GithubGrant, message: string, link: string, changed: boolean): InstallCheck {
  return {
    grant,
    changed,
    status: 'rejected',
    message,
    link,
    report: {
      status: 'rejected',
      account: grant.account,
      kind: 'github-app',
      expiresAt: new Date(grant.accessExpiresAt).toISOString(),
      capabilities: [],
      message,
      link,
    },
  };
}

export interface InstallCheck {
  grant: GithubGrant;
  changed: boolean;
  status: 'valid' | 'rejected';
  message: string;
  link: string;
  report: TokenReport;
}

function cap(key: TokenCapability['key'], state: TokenCapability['state'], how = '', label?: string): TokenCapability {
  return { key, label: label ?? '', state, how: state === 'ok' ? '' : how };
}

export async function checkInstallation(input: {
  grant: GithubGrant;
  owner: string;
  repo: string;
  fetchImpl: typeof fetch;
  now: number;
}): Promise<InstallCheck> {
  const listed = await githubAuthorizedFetch({
    grant: input.grant,
    url: 'https://api.github.com/user/installations',
    fetchImpl: input.fetchImpl,
    now: input.now,
  });
  if (!listed.response) return rejected(listed.grant, listed.message || '连不上 GitHub', '', listed.changed);
  const rows = readInstallations(await listed.response.json());
  const match = rows.find((row) => row.login.toLowerCase() === input.owner.toLowerCase());
  let repoNames: string[] = [];
  let hasMore = false;
  let grant = listed.grant;
  let changed = listed.changed;
  if (match && match.selection !== 'all') {
    const repos = await githubAuthorizedFetch({
      grant,
      url: `https://api.github.com/user/installations/${match.id}/repositories?per_page=100`,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
    grant = repos.grant;
    changed = changed || repos.changed;
    if (!repos.response) return rejected(grant, repos.message || '连不上 GitHub', '', changed);
    repoNames = readInstallationRepos(await repos.response.json());
    hasMore = (repos.response.headers.get('link') ?? '').includes('rel="next"');
  }
  const scope = interpretInstallScope({
    rows,
    repoNames,
    hasMore,
    owner: input.owner,
    repo: input.repo,
  });
  if (!scope.ok) return rejected(grant, scope.message, scope.link, changed);
  if (!match) return rejected(grant, '先把 XiaoBlog Studio 安装到这个仓库', GITHUB_APP_INSTALL_URL, changed);
  const headers = {
    Authorization: `Bearer ${grant.accessToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'XiaoBlog',
  };
  const basic = `Basic ${Buffer.from(`x-access-token:${grant.accessToken}`, 'utf8').toString('base64')}`;
  let push: Response;
  let actions: Response;
  let pages: Response;
  try {
    [push, actions, pages] = await Promise.all([
      input.fetchImpl(`https://github.com/${input.owner}/${input.repo}.git/info/refs?service=git-receive-pack`, {
        headers: { Authorization: basic, 'User-Agent': 'XiaoBlog' },
      }),
      input.fetchImpl(`https://api.github.com/repos/${input.owner}/${input.repo}/actions/runs?per_page=1`, { headers }),
      input.fetchImpl(`https://api.github.com/repos/${input.owner}/${input.repo}/pages`, { headers }),
    ]);
  } catch {
    return rejected(grant, '连不上 GitHub', '', changed);
  }
  if (push.status !== 200) {
    await push.body?.cancel().catch(() => undefined);
    return rejected(grant, '还不能推送到这个仓库。', installationSettingsUrl(match?.login ?? input.owner, match?.id ?? 0, match?.accountType ?? 'User'), changed);
  }
  await push.body?.cancel().catch(() => undefined);
  let buildType = '';
  if (pages.ok) {
    try {
      buildType = ((await pages.json()) as { build_type?: string }).build_type ?? '';
    } catch {
      buildType = '';
    }
  } else {
    await pages.body?.cancel().catch(() => undefined);
  }
  const pagesFact = pagesCapability(pages.status, buildType);
  const actionsState: TokenCapability['state'] = actions.ok ? 'ok' : actions.status === 401 || actions.status === 403 ? 'missing' : 'unknown';
  await actions.body?.cancel().catch(() => undefined);
  const capabilities: TokenCapability[] = [
    cap('push', 'ok', '', '推送内容'),
    cap('workflow', 'ok', '', '修改构建配置'),
    { key: 'hosting', label: '开启 Pages', state: pagesFact.state, how: pagesFact.how },
    cap('actions', actionsState, '读取构建记录需要 Actions 读。', '读取构建记录'),
  ];
  const report: TokenReport = {
    status: 'valid',
    account: grant.account,
    kind: 'github-app',
    expiresAt: new Date(grant.accessExpiresAt).toISOString(),
    capabilities,
    message: '',
    link: '',
  };
  return { grant, changed, status: 'valid', message: '', link: '', report };
}
