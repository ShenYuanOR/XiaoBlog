import fs from 'node:fs';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import { createHttpClient, checkPush, type HttpFetch } from './git.ts';

/**
 * 发布远端：先用 Electron 的 net.fetch 走系统代理，再交给 isomorphic-git。
 * 不依赖用户安装 git（D-13）。
 */
export function createNetHttpClient(fetchImpl: HttpFetch): {
  request: ReturnType<typeof createHttpClient>['request'];
} {
  return createHttpClient(fetchImpl);
}

export interface DeployTarget {
  provider: 'gitea' | 'github';
  remoteUrl: string;
  branch: string;
  /** 远端登录名（Gitea 用登录名或邮箱；GitHub 可留空走 x-access-token）。 */
  login?: string;
}

export interface PushSiteInput {
  siteDir: string;
  target: DeployTarget;
  token: string;
  login?: string;
  http: { request: (request: never) => Promise<never> } | ReturnType<typeof createHttpClient>;
  force?: boolean;
  authorName?: string;
  authorEmail?: string;
  now?: Date;
}

export interface PushSiteResult {
  committed: boolean;
  forced: boolean;
  warnings: string[];
  message: string;
  remote: string;
  branch: string;
}

function isNothingToCommit(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /nothing to commit|No changes|no changes/i.test(text);
}

async function stageChanges(siteDir: string): Promise<{ staged: string[]; removed: string[] }> {
  const matrix = (await git.statusMatrix({ fs, dir: siteDir })) as unknown as [
    string,
    number,
    number,
    number,
  ][];
  const staged: string[] = [];
  const removed: string[] = [];
  for (const [filepath, head, workdir, stage] of matrix) {
    if (workdir === 0 && head === 1) {
      await git.remove({ fs, dir: siteDir, filepath });
      removed.push(filepath);
      continue;
    }
    if (workdir !== 0 && (workdir !== stage || head !== workdir)) {
      await git.add({ fs, dir: siteDir, filepath });
      staged.push(filepath);
    }
  }
  return { staged, removed };
}

async function ensureRemote(siteDir: string, remoteUrl: string): Promise<void> {
  const remotes = await git.listRemotes({ fs, dir: siteDir });
  const origin = remotes.find((item) => item.remote === 'origin');
  if (!origin) {
    await git.addRemote({ fs, dir: siteDir, remote: 'origin', url: remoteUrl });
    return;
  }
  if (origin.url !== remoteUrl) {
    await git.deleteRemote({ fs, dir: siteDir, remote: 'origin' });
    await git.addRemote({ fs, dir: siteDir, remote: 'origin', url: remoteUrl });
  }
}

async function currentBranch(siteDir: string, fallback: string): Promise<string> {
  try {
    const branch = await git.currentBranch({ fs, dir: siteDir, fullname: false });
    return branch || fallback;
  } catch {
    return fallback;
  }
}

function readPreflight(siteDir: string, paths: string[]) {
  const files = paths.map((filepath) => {
    const full = path.join(siteDir, filepath);
    let bytes = 0;
    try {
      bytes = statSync(full).size;
    } catch {
      bytes = 0;
    }
    return { path: filepath, bytes };
  });
  let gitignore = '';
  try {
    gitignore = readFileSync(path.join(siteDir, '.gitignore'), 'utf8');
  } catch {
    gitignore = '';
  }
  return { files, gitignore };
}

function friendlyPushError(error: unknown, token: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  const text = token ? raw.split(token).join('[secret]') : raw;
  if (/fast-forward|PushRejected/i.test(text)) {
    return '远端有你本地没有的提交。确认要覆盖远端内容后，点「覆盖远端并发」重试。';
  }
  if (/canceled|cancelled|401|Unauthorized|authentication/i.test(text)) {
    return '认证失败：检查「用户名」和访问令牌是否属于这个仓库、是否过期或有写权限。';
  }
  if (/HttpError.*403|Forbidden/i.test(text)) {
    return '令牌没有写入权限：在 Gitea 里给这个令牌勾上仓库写权限。';
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|fetch failed/i.test(text)) {
    return '连不上远端：检查地址、网络，或这台电脑是否需要代理。';
  }
  return `推送失败：${text}`;
}

/** 舞台 → 提交 → 推送。远端不是快进时抛错，由界面确认后带 force 重试。 */
export async function pushSite(input: PushSiteInput): Promise<PushSiteResult> {
  const { siteDir, target } = input;
  if (!existsSync(path.join(siteDir, '.git'))) throw new Error('这个站点还不是 git 仓库');
  await ensureRemote(siteDir, target.remoteUrl);
  const branch = await currentBranch(siteDir, target.branch || 'master');
  const { staged, removed } = await stageChanges(siteDir);
  const tracked = await git.listFiles({ fs, dir: siteDir });
  const preflight = readPreflight(siteDir, [...staged, ...removed]);
  const check = checkPush({
    files: preflight.files,
    gitignore: preflight.gitignore,
    tracked,
  });
  if (check.errors.length > 0) throw new Error(check.errors.join('；'));

  let committed = false;
  const now = input.now ?? new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const message = `发布：${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (staged.length > 0 || removed.length > 0) {
    try {
      await git.commit({
        fs,
        dir: siteDir,
        message,
        author: {
          name: input.authorName || '晓',
          email: input.authorEmail || 'studio@localhost',
        },
      });
      committed = true;
    } catch (error) {
      if (!isNothingToCommit(error)) throw error;
    }
  }

  try {
    await git.push({
      fs,
      dir: siteDir,
      http: input.http as never,
      remote: 'origin',
      ref: branch,
      ...(target.branch && target.branch !== branch ? { remoteRef: target.branch } : {}),
      force: Boolean(input.force),
      onAuth: () => ({ username: input.login || 'x-access-token', password: input.token }),
      onAuthFailure: () => ({ cancel: true }),
    });
  } catch (error) {
    throw new Error(friendlyPushError(error, input.token));
  }

  return {
    committed,
    forced: Boolean(input.force),
    warnings: check.warnings,
    message,
    remote: target.remoteUrl,
    branch,
  };
}

/** 远端可连、仓库存在、凭据有写权限时返回通过。用 receive-pack 探测，因为公开仓库的读接口匿名也能过。 */
export async function probeRemote(
  remoteUrl: string,
  login: string,
  token: string,
  httpClient: ReturnType<typeof createHttpClient>,
): Promise<{ ok: boolean; message: string }> {
  const auth = `Basic ${Buffer.from(`${login || 'x-access-token'}:${token}`, 'utf8').toString('base64')}`;
  const target = `${remoteUrl.replace(/\/$/, '')}/info/refs?service=git-receive-pack`;
  try {
    const response = await httpClient.request({
      url: target,
      method: 'GET',
      headers: { Authorization: auth, 'User-Agent': 'XiaoBlog' },
    });
    if (response.statusCode === 200) return { ok: true, message: '' };
    if (response.statusCode === 401) {
      return {
        ok: false,
        message: '用户名或令牌不对：Gitea 的「用户名」填登录名或邮箱，令牌要有这个仓库的写权限。',
      };
    }
    if (response.statusCode === 404) {
      return { ok: false, message: '仓库不存在：检查地址里的用户名和仓库名是否正确。' };
    }
    return { ok: false, message: `远端返回 ${response.statusCode}，先确认这个仓库能写。` };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const text = token ? raw.split(token).join('[secret]') : raw;
    return { ok: false, message: `连不上远端：${text}` };
  }
}

/** 读远端的默认分支（空仓库或匿名可读时读不到，回退 master）。 */
export async function remoteDefaultBranch(
  remoteUrl: string,
  login: string,
  token: string,
  httpClient: ReturnType<typeof createHttpClient>,
): Promise<string> {
  try {
    const info = (await git.getRemoteInfo({
      http: httpClient as never,
      url: remoteUrl,
      onAuth: () => ({ username: login || 'x-access-token', password: token }),
    })) as { HEAD?: string };
    const head = info.HEAD;
    if (head?.startsWith('refs/heads/')) return head.slice('refs/heads/'.length);
  } catch {
    // 空仓库、或服务端不允许匿名读时拿不到 HEAD，按 master 处理。
  }
  return 'master';
}

export interface DeployStore {
  read(): Record<string, DeployTarget>;
  write(all: Record<string, DeployTarget>): void;
}

export function createDeployStore(file: string): DeployStore {
  return {
    read(): Record<string, DeployTarget> {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as Record<string, DeployTarget>;
      } catch {
        return {};
      }
    },
    write(all: Record<string, DeployTarget>): void {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
    },
  };
}
