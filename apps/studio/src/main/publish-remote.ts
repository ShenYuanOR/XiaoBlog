import { githubPagesSettingsLink } from './publish-token.ts';
import { parseGitRemote } from './publish-workflow.ts';

export interface RepoChoice {
  owner: string;
  name: string;
  private: boolean;
  empty: boolean;
  url: string;
  branch: string;
}

export function readRepoChoices(origin: string, body: unknown): RepoChoice[] {
  if (!Array.isArray(body)) return [];
  const root = origin.replace(/\/$/, '');
  const out: RepoChoice[] = [];
  for (const row of body) {
    if (!row || typeof row !== 'object') continue;
    const item = row as {
      full_name?: string;
      name?: string;
      private?: boolean;
      size?: number;
      empty?: boolean;
      default_branch?: string;
      clone_url?: string;
      html_url?: string;
      owner?: { login?: string };
    };
    const full = item.full_name ?? '';
    const [ownerFromFull, nameFromFull] = full.split('/');
    const owner = item.owner?.login || ownerFromFull || '';
    const name = item.name || nameFromFull || '';
    if (!owner || !name) continue;
    const empty = (item.size ?? 0) === 0;
    const url = (item.clone_url || item.html_url || `${root}/${owner}/${name}`).replace(/\.git$/, '');
    out.push({
      owner,
      name,
      private: item.private === true,
      empty,
      url,
      branch: item.default_branch || 'main',
    });
  }
  return out;
}

export function readRepoRecord(body: unknown): { empty: boolean; isPrivate: boolean; branch: string } {
  const item = (body && typeof body === 'object' ? body : {}) as {
    size?: number;
    empty?: boolean;
    private?: boolean;
    default_branch?: string;
  };
  const empty = typeof item.empty === 'boolean' ? item.empty : (item.size ?? 0) === 0;
  return { empty, isPrivate: item.private === true, branch: item.default_branch || 'main' };
}

export function interpretPagesCreate(status: number): 'ok' | 'exists' | 'manual' {
  if (status === 201 || status === 200) return 'ok';
  if (status === 409) return 'exists';
  return 'manual';
}

export function interpretPagesRead(status: number, buildType: string): 'ok' | 'update' | 'manual' {
  if (status === 200 && buildType === 'workflow') return 'ok';
  if (status === 200) return 'update';
  return 'manual';
}

/** 首页是固定前缀。`/<owner>/<repo>/` 原样返回，不会换成仓库名。 */
export function readCreatedRepo(
  status: number,
  body: unknown,
): { ok: boolean; remoteUrl: string; owner: string; repo: string; branch: string; message: string } {
  if (status === 401 || status === 403) {
    return { ok: false, remoteUrl: '', owner: '', repo: '', branch: '', message: '这个令牌不能新建仓库。用网页新建后再回来。' };
  }
  if (status !== 201 && status !== 200) {
    return { ok: false, remoteUrl: '', owner: '', repo: '', branch: '', message: `新建仓库没有成功（HTTP ${status}）。可以用网页新建。` };
  }
  const item = (body && typeof body === 'object' ? body : {}) as {
    clone_url?: string;
    html_url?: string;
    full_name?: string;
    default_branch?: string;
  };
  const remoteUrl = (item.clone_url || item.html_url || '').replace(/\.git$/, '');
  const [owner, repo] = (item.full_name ?? '').split('/');
  if (!remoteUrl || !owner || !repo) {
    return { ok: false, remoteUrl: '', owner: '', repo: '', branch: '', message: '仓库建好了，但返回里没有地址。用网页确认后再填地址。' };
  }
  return { ok: true, remoteUrl, owner, repo, branch: item.default_branch || 'main', message: '' };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'XiaoBlog',
  };
}

export async function listRemoteRepos(input: {
  origin: string;
  token: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; repos: RepoChoice[] } | { ok: false; message: string }> {
  const root = 'https://github.com';
  const url = 'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member';
  const headers = githubHeaders(input.token);
  try {
    const response = await input.fetchImpl(url, { headers });
    if (response.status === 401 || response.status === 403) return { ok: false, message: '令牌已失效' };
    if (!response.ok) return { ok: false, message: `列不出仓库（HTTP ${response.status}）。可以直接粘贴地址。` };
    return { ok: true, repos: readRepoChoices(root, await response.json()) };
  } catch (error) {
    return { ok: false, message: `连不上：${error instanceof Error ? error.message : '网络失败'}` };
  }
}

export async function readRemoteFacts(input: {
  remoteUrl: string;
  token: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: true; owner: string; repo: string; branch: string; empty: boolean; xiao: boolean; isPrivate: boolean } | { ok: false; message: string }> {
  const remote = parseGitRemote(input.remoteUrl);
  if (!remote) return { ok: false, message: '仓库地址解析不了。' };
  const headers = githubHeaders(input.token);
  const repoUrl = `https://api.github.com/repos/${remote.owner}/${remote.repo}`;
  const configUrl = `${repoUrl}/contents/xiao.config.json`;
  try {
    const response = await input.fetchImpl(repoUrl, { headers });
    if (response.status === 404) return { ok: false, message: '仓库不存在：检查用户名和仓库名。' };
    if (response.status === 401 || response.status === 403) return { ok: false, message: '令牌已失效' };
    if (!response.ok) return { ok: false, message: `读仓库失败（HTTP ${response.status}）。` };
    const record = readRepoRecord(await response.json());
    const config = await input.fetchImpl(configUrl, { headers });
    return {
      ok: true,
      owner: remote.owner,
      repo: remote.repo,
      branch: record.branch,
      empty: record.empty,
      xiao: config.status >= 200 && config.status < 300,
      isPrivate: record.isPrivate,
    };
  } catch (error) {
    return { ok: false, message: `连不上：${error instanceof Error ? error.message : '网络失败'}` };
  }
}

export async function createRemoteRepo(input: {
  token: string;
  name: string;
  fetchImpl: typeof fetch;
}): Promise<{ ok: boolean; remoteUrl: string; owner: string; repo: string; branch: string; message: string }> {
  const name = input.name.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return { ok: false, remoteUrl: '', owner: '', repo: '', branch: '', message: '仓库名只能用字母、数字、点、下划线和横线。' };
  }
  const url = 'https://api.github.com/user/repos';
  const headers = { ...githubHeaders(input.token), 'Content-Type': 'application/json' };
  try {
    const response = await input.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, private: false, auto_init: false }),
    });
    return readCreatedRepo(response.status, response.ok ? await response.json() : {});
  } catch (error) {
    return {
      ok: false,
      remoteUrl: '',
      owner: '',
      repo: '',
      branch: '',
      message: `连不上：${error instanceof Error ? error.message : '网络失败'}`,
    };
  }
}

export async function enableGithubPages(
  owner: string,
  repo: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<{ state: 'ok' | 'manual'; detail: string; link: string }> {
  const headers = { ...githubHeaders(token), 'Content-Type': 'application/json' };
  const url = `https://api.github.com/repos/${owner}/${repo}/pages`;
  const link = githubPagesSettingsLink(owner, repo);
  const manual = {
    state: 'manual' as const,
    detail: '这个令牌开不了 Pages。打开仓库 Settings → Pages，Source 选 GitHub Actions。',
    link,
  };
  let created: Response;
  try {
    created = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify({ build_type: 'workflow' }) });
  } catch (error) {
    return { state: 'manual', detail: `连不上 GitHub：${error instanceof Error ? error.message : '网络失败'}`, link };
  }
  const createdKind = interpretPagesCreate(created.status);
  if (createdKind === 'ok') return { state: 'ok', detail: 'Pages 已按 workflow 开启。', link: '' };
  if (createdKind === 'manual') return manual;
  let current: Response;
  try {
    current = await fetchImpl(url, { headers });
  } catch {
    return manual;
  }
  let buildType = '';
  if (current.ok) {
    try {
      buildType = ((await current.json()) as { build_type?: string }).build_type ?? '';
    } catch {
      buildType = '';
    }
  }
  const readKind = interpretPagesRead(current.status, buildType);
  if (readKind === 'ok') return { state: 'ok', detail: 'Pages 已经是 workflow。', link: '' };
  if (readKind === 'update') {
    try {
      const updated = await fetchImpl(url, { method: 'PUT', headers, body: JSON.stringify({ build_type: 'workflow' }) });
      if (updated.ok) return { state: 'ok', detail: 'Pages 已改成 workflow。', link: '' };
    } catch {
      return manual;
    }
  }
  return manual;
}


