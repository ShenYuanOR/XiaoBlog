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

export interface PublicLookup {
  owner: string;
  repo: string;
  remoteUrl: string;
  found: boolean;
  empty: boolean;
  isPrivate: boolean;
  xiao: boolean;
  branch: string;
  message: string;
}

/** 不带令牌。提交列表 409 表示空仓库。404 允许下一步再用令牌确认。 */
export function interpretPublicRepo(input: {
  owner: string;
  repo: string;
  remoteUrl: string;
  repoStatus: number;
  repoBody: unknown;
  commitsStatus: number;
  configStatus: number;
}): PublicLookup {
  const base = {
    owner: input.owner,
    repo: input.repo,
    remoteUrl: input.remoteUrl,
    empty: false,
    isPrivate: false,
    xiao: false,
    branch: 'main',
  };
  if (input.repoStatus === 404) {
    return { ...base, found: false, message: '没找到，可能是私有仓库或还没建。' };
  }
  if (input.repoStatus !== 200) {
    return { ...base, found: false, message: `查仓库失败（HTTP ${input.repoStatus}）。` };
  }
  const record = readRepoRecord(input.repoBody);
  return {
    ...base,
    found: true,
    empty: input.commitsStatus === 409,
    isPrivate: record.isPrivate,
    xiao: input.configStatus >= 200 && input.configStatus < 300,
    branch: record.branch,
    message: record.isPrivate ? '免费套餐只有公开仓库能用 Pages。' : '',
  };
}

export async function lookupPublicRepo(remoteUrl: string, fetchImpl: typeof fetch): Promise<PublicLookup | { ok: false; message: string }> {
  const remote = parseGitRemote(remoteUrl);
  if (!remote) return { ok: false, message: '仓库地址解析不了。' };
  const repoUrl = `https://api.github.com/repos/${remote.owner}/${remote.repo}`;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'XiaoBlog' };
  try {
    const response = await fetchImpl(repoUrl, { headers });
    if (response.status === 404) {
      return interpretPublicRepo({
        owner: remote.owner,
        repo: remote.repo,
        remoteUrl: `https://github.com/${remote.owner}/${remote.repo}`,
        repoStatus: 404,
        repoBody: {},
        commitsStatus: 404,
        configStatus: 404,
      });
    }
    if (!response.ok) return { ok: false, message: `查仓库失败（HTTP ${response.status}）。` };
    const body = await response.json();
    const [commits, config] = await Promise.all([
      fetchImpl(`${repoUrl}/commits?per_page=1`, { headers }),
      fetchImpl(`${repoUrl}/contents/xiao.config.json`, { headers }),
    ]);
    return interpretPublicRepo({
      owner: remote.owner,
      repo: remote.repo,
      remoteUrl: `https://github.com/${remote.owner}/${remote.repo}`,
      repoStatus: response.status,
      repoBody: body,
      commitsStatus: commits.status,
      configStatus: config.status,
    });
  } catch (error) {
    return { ok: false, message: `连不上 GitHub：${error instanceof Error ? error.message : '网络失败'}` };
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

async function readPagesState(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<{ status: number; buildType: string } | { error: string }> {
  try {
    const current = await fetchImpl(url, { headers });
    let buildType = '';
    if (current.ok) {
      try {
        buildType = ((await current.json()) as { build_type?: string }).build_type ?? '';
      } catch {
        buildType = '';
      }
    }
    return { status: current.status, buildType };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '网络失败' };
  }
}

/** 先读 Pages。已是 workflow 就不写。重新检查只看这次读取，不再 POST / PUT。 */
export async function enableGithubPages(
  owner: string,
  repo: string,
  token: string,
  fetchImpl: typeof fetch,
  options?: { recheck?: boolean },
): Promise<{ state: 'ok' | 'manual'; detail: string; link: string }> {
  const headers = { ...githubHeaders(token), 'Content-Type': 'application/json' };
  const url = `https://api.github.com/repos/${owner}/${repo}/pages`;
  const link = githubPagesSettingsLink(owner, repo);
  const manual = {
    state: 'manual' as const,
    detail: '这个令牌开不了 Pages。打开仓库 Settings → Pages，Source 选 GitHub Actions。',
    link,
  };
  const read = await readPagesState(url, headers, fetchImpl);
  if ('error' in read) return { state: 'manual', detail: `连不上 GitHub：${read.error}`, link };
  if (interpretPagesRead(read.status, read.buildType) === 'ok') {
    return { state: 'ok', detail: 'Pages 已经是 workflow。', link: '' };
  }
  if (options?.recheck) return manual;
  if (read.status !== 404 && read.status !== 200) return manual;
  const method = read.status === 404 ? 'POST' : 'PUT';
  let written: Response;
  try {
    written = await fetchImpl(url, { method, headers, body: JSON.stringify({ build_type: 'workflow' }) });
  } catch (error) {
    return { state: 'manual', detail: `连不上 GitHub：${error instanceof Error ? error.message : '网络失败'}`, link };
  }
  if (interpretPagesCreate(written.status) === 'ok') {
    return {
      state: 'ok',
      detail: method === 'POST' ? 'Pages 已按 workflow 开启。' : 'Pages 已改成 workflow。',
      link: '',
    };
  }
  return manual;
}


