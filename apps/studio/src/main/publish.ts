import fs from 'node:fs';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import { createHttpClient, checkPush, type HttpFetch } from './git.ts';
import { parseGiteaRemote } from './publish-workflow.ts';

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
  /** 发布后读者打开的站点网址。Gitea 由用户填写。 */
  siteUrl?: string;
  /** 连接时探测到的 Actions / 构建机状态。 */
  actionsState?: 'ready' | 'disabled' | 'no-runner' | 'unknown';
  actionsDetail?: string;
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
  sha: string;
}

function isNothingToCommit(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /nothing to commit|No changes|no changes/i.test(text);
}

/** 旧版 Studio 的初始化提交把 .git/HEAD 之类写进了索引；isomorphic-git 见到就报 unsafe。重建索引即可。 */
async function repairLegacyIndex(siteDir: string): Promise<boolean> {
  const tracked = await git.listFiles({ fs, dir: siteDir });
  const hasBad = tracked.some((filepath) => filepath === '.git' || filepath.startsWith('.git/'));
  if (!hasBad) return false;
  rmSync(path.join(siteDir, '.git', 'index'), { force: true });
  console.warn('检测到旧版索引里的 .git 条目，已重建 git 索引');
  return true;
}

const walkSkip = new Set([
  'node_modules',
  'dist',
  '.astro',
  '.pnpm-store',
  '.xiao-recycle',
  '.xiao-pnpm-store',
  '.shim',
  'release',
  'release2',
]);

/** 只跳过 .git 本体和修复备份。`.gitea`、`.github`、`.gitignore` 都要能提交。 */
export function skipPath(filepath: string): boolean {
  const normalized = filepath.replaceAll('\\', '/');
  const first = normalized.split('/')[0] ?? normalized;
  if (first === '.git' || normalized.startsWith('.git/')) return true;
  if (first.startsWith('.git-broken-')) return true;
  return (
    first === '.xiao-recycle' ||
    first === '.xiao-pnpm-store' ||
    first === '.pnpm-store' ||
    first === 'node_modules' ||
    first === 'dist' ||
    first === '.astro' ||
    first === '.shim'
  );
}

const maxCommitFiles = 2000;
const maxFileBytes = 20 * 1024 * 1024;

/** 提交太大时拦住，并指出文件最多的那个顶层目录。 */
export function guardCommitSize(files: { path: string; bytes: number }[]): string | null {
  const huge = files.filter((file) => file.bytes > maxFileBytes);
  if (huge.length > 0) {
    return `这些文件超过 20 MB，不能发布：${huge
      .slice(0, 5)
      .map((file) => file.path)
      .join('、')}`;
  }
  if (files.length <= maxCommitFiles) return null;
  const counts = new Map<string, number>();
  for (const file of files) {
    const top = file.path.split('/')[0] || file.path;
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  const [dir, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return `这次要提交 ${files.length} 个文件，超过 ${maxCommitFiles}。最大的目录是 ${dir}（${count} 个）。先把不该发布的目录忽略掉。`;
}

function walkFiles(root: string, dir = root): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (walkSkip.has(name) || skipPath(rel)) continue;
    if (statSync(full).isDirectory()) found.push(...walkFiles(root, full));
    else found.push(rel);
  }
  return found;
}

function isUnsafePathError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /unsafe character sequences/i.test(text);
}

/**
 * 旧版 Studio 把 `.git/HEAD` 写进了初始提交的树里，isomorphic-git 连读树都会拒绝。
 * 修复方式：把整个 .git 备份成 .git-broken-<时间>，重新 init 并提交一次；站点文件不动。
 */
export async function repairRepository(
  siteDir: string,
): Promise<{ backup: string; files: number }> {
  const gitDir = path.join(siteDir, '.git');
  // 备份放到站点同盘的旁边目录：跨卷复制会被安全软件拦（EIO），放站点里又会被推送带上。
  const backup = path.join(
    path.dirname(siteDir),
    `.xiao-git-backup-${path.basename(siteDir)}-${Date.now()}`,
  );
  if (existsSync(gitDir)) {
    fs.cpSync(gitDir, backup, { recursive: true });
    fs.rmSync(gitDir, { recursive: true, force: true });
  }
  await git.init({ fs, dir: siteDir, defaultBranch: 'master' });
  const files = walkFiles(siteDir);
  for (const filepath of files) await git.add({ fs, dir: siteDir, filepath });
  await git.commit({
    fs,
    dir: siteDir,
    message: '初始化站点（修复 git 历史）',
    author: { name: '晓', email: 'studio@localhost' },
  });
  return { backup, files: files.length };
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
  const adding: string[] = [];
  for (const row of matrix) {
    if (!row) continue;
    const [filepath, head, workdir, stage] = row;
    if (!filepath || skipPath(filepath)) continue;
    if (workdir === 0 && head === 1) {
      removed.push(filepath);
      continue;
    }
    if (workdir !== 0 && (workdir !== stage || head !== workdir)) adding.push(filepath);
  }
  const sized = adding.map((filepath) => {
    let bytes = 0;
    try {
      bytes = statSync(path.join(siteDir, filepath)).size;
    } catch {
      bytes = 0;
    }
    return { path: filepath, bytes };
  });
  const blocked = guardCommitSize(sized);
  if (blocked) throw new Error(blocked);
  for (const filepath of removed) {
    await git.remove({ fs, dir: siteDir, filepath });
  }
  for (const filepath of adding) {
    await git.add({ fs, dir: siteDir, filepath });
    staged.push(filepath);
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
/** 舞台 → 提交 → 推送。远端不是快进时抛错，由界面确认后带 force 重试。 */
export async function pushSite(input: PushSiteInput): Promise<PushSiteResult> {
  try {
    return await pushSiteInner(input);
  } catch (error) {
    if (isUnsafePathError(error)) {
      throw new Error(
        'REPO_BROKEN:这个站点的 git 历史里有旧版 Studio 写入的 .git 条目，需要重建 git 历史（站点文件不动，旧 .git 会备份）。',
      );
    }
    throw error;
  }
}

async function pushSiteInner(input: PushSiteInput): Promise<PushSiteResult> {
  const { siteDir, target } = input;
  if (!existsSync(path.join(siteDir, '.git'))) throw new Error('这个站点还不是 git 仓库');
  await ensureRemote(siteDir, target.remoteUrl);
  await repairLegacyIndex(siteDir);
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
  let sha = '';
  const now = input.now ?? new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const message = `发布：${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (staged.length > 0 || removed.length > 0) {
    try {
      sha = await git.commit({
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
    const refs = pushRefs(branch, target.branch || branch);
    await git.push({
      fs,
      dir: siteDir,
      http: input.http as never,
      remote: 'origin',
      ref: refs.ref,
      ...(refs.remoteRef ? { remoteRef: refs.remoteRef } : {}),
      force: Boolean(input.force),
      onAuth: () => ({ username: input.login || 'x-access-token', password: input.token }),
      onAuthFailure: () => ({ cancel: true }),
    });
  } catch (error) {
    throw new Error(friendlyPushError(error, input.token));
  }

  if (!sha) sha = await git.resolveRef({ fs, dir: siteDir, ref: 'HEAD' });
  return {
    committed,
    forced: Boolean(input.force),
    warnings: check.warnings,
    message,
    remote: target.remoteUrl,
    branch,
    sha,
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

/** 空仓库没有 HEAD。Gitea 这时的默认分支是接口里的 default_branch，通常是 main。 */
export function chooseDefaultBranch(head: string | undefined, apiBranch: string | undefined): string {
  if (head?.startsWith('refs/heads/')) return head.slice('refs/heads/'.length);
  const fromApi = apiBranch?.trim();
  return fromApi || 'main';
}

/** 本地分支和远端默认分支不同时，推到远端那条，不把远端改成本地的名字。 */
export function pushRefs(local: string, remote: string): { ref: string; remoteRef?: string } {
  if (remote && remote !== local) return { ref: local, remoteRef: remote };
  return { ref: local };
}

/** 读远端的默认分支。空仓库改问 Gitea 的 default_branch。 */
export async function remoteDefaultBranch(
  remoteUrl: string,
  login: string,
  token: string,
  httpClient: ReturnType<typeof createHttpClient>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let head = '';
  try {
    const info = (await git.getRemoteInfo({
      http: httpClient as never,
      url: remoteUrl,
      onAuth: () => ({ username: login || 'x-access-token', password: token }),
    })) as { HEAD?: string };
    head = info.HEAD ?? '';
    if (head.startsWith('refs/heads/')) return chooseDefaultBranch(head, undefined);
  } catch {
    head = '';
  }
  let apiBranch = '';
  try {
    const remote = parseGiteaRemote(remoteUrl);
    if (remote) {
      const response = await fetchImpl(`${remote.origin}/api/v1/repos/${remote.owner}/${remote.repo}`, {
        headers: { Authorization: `token ${token}` },
      });
      if (response.ok) {
        const body = (await response.json()) as { default_branch?: string };
        apiBranch = body.default_branch ?? '';
      }
    }
  } catch {
    apiBranch = '';
  }
  return chooseDefaultBranch(head, apiBranch);
}

export interface DeployStore {
  read(): Record<string, DeployTarget>;
  write(all: Record<string, DeployTarget>): void;
  /** 最近一次 write 是否真的落盘（false = 只在本次运行有效）。 */
  persisted(): boolean;
}

export function createDeployStore(file: string): DeployStore {
  let memory: Record<string, DeployTarget> = {};
  let diskOk = true;
  return {
    read(): Record<string, DeployTarget> {
      try {
        return {
          ...memory,
          ...(JSON.parse(readFileSync(file, 'utf8')) as Record<string, DeployTarget>),
        };
      } catch {
        return { ...memory };
      }
    },
    write(all: Record<string, DeployTarget>): void {
      memory = { ...all };
      try {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
        diskOk = true;
      } catch (error) {
        diskOk = false;
        console.warn(
          `仓库连接信息无法写入本机，只在本次运行有效：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    persisted(): boolean {
      return diskOk;
    },
  };
}
