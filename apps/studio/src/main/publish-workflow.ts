import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deployWorkflow } from './wizard.ts';

export const WORKFLOW_VERSION = 2;
export const WORKFLOW_PATH = '.gitea/workflows/xiao-deploy.yml';
export const GITHUB_WORKFLOW_PATH = '.github/workflows/xiao-deploy.yml';

export interface GiteaRemote {
  origin: string;
  owner: string;
  repo: string;
}

export interface ActionsProbe {
  state: 'ready' | 'disabled' | 'no-runner' | 'unknown';
  detail: string;
}

export function parseGiteaRemote(remoteUrl: string): GiteaRemote | null {
  try {
    const url = new URL(remoteUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const repo = (parts[parts.length - 1] ?? '').replace(/\.git$/, '');
    const owner = parts[parts.length - 2] ?? '';
    if (!owner || !repo) return null;
    return { origin: url.origin, owner, repo };
  } catch {
    return null;
  }
}

export function workflowYaml(branch: string): string {
  const safe = branch.replace(/"/g, '');
  return `# 由晓生成。版本：${WORKFLOW_VERSION}
# 版本号相同的话，再次连接不会覆盖这份文件。
name: 发布站点
on:
  push:
    branches: ["${safe}"]
  workflow_dispatch:
jobs:
  deploy:
    runs-on: xiao
    env:
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0"
      REPO_URL: \${{ github.server_url }}/\${{ github.repository }}.git
      TOKEN: \${{ secrets.GITEA_TOKEN }}
    steps:
      - name: 取代码
        run: |
          git -c http.extraHeader="Authorization: token $TOKEN" clone --depth 1 --branch "\${{ github.ref_name }}" "$REPO_URL" site
      - name: 安装依赖
        working-directory: site
        run: |
          corepack enable
          pnpm install --frozen-lockfile
      - name: 构建
        working-directory: site
        env:
          XIAO_BUILD_SHA: \${{ github.sha }}
        run: pnpm build
      - name: 推送到 pages 分支
        working-directory: site/dist
        run: |
          head=$(git -c http.extraHeader="Authorization: token $TOKEN" ls-remote "$REPO_URL" "refs/heads/\${{ github.ref_name }}" | cut -f1)
          if [ "$head" != "\${{ github.sha }}" ]; then echo "已有更新的提交 $head，本次不推送"; exit 0; fi
          touch .nojekyll
          git init -q -b pages
          git add -A
          git -c user.name=xiao-bot -c user.email=xiao-bot@localhost commit -q -m "pages: \${{ github.sha }}"
          git -c http.extraHeader="Authorization: token $TOKEN" push -f "$REPO_URL" pages
`;
}

/** GitHub Pages 构建配置。内容相同就保留。 */
export function writeGithubWorkflow(siteDir: string, branch: string): 'written' | 'kept' {
  const full = join(siteDir, GITHUB_WORKFLOW_PATH);
  const next = deployWorkflow(branch);
  if (existsSync(full) && readFileSync(full, 'utf8') === next) return 'kept';
  mkdirSync(join(siteDir, '.github', 'workflows'), { recursive: true });
  writeFileSync(full, next);
  return 'written';
}

/** 已有同版本文件就保留。返回 written 或 kept。 */
export function writeDeployWorkflow(siteDir: string, branch: string): 'written' | 'kept' {
  const full = join(siteDir, WORKFLOW_PATH);
  if (existsSync(full)) {
    const current = readFileSync(full, 'utf8');
    if (current.includes(`版本：${WORKFLOW_VERSION}`)) return 'kept';
  }
  mkdirSync(join(siteDir, '.gitea', 'workflows'), { recursive: true });
  writeFileSync(full, workflowYaml(branch));
  return 'written';
}

interface RunnerRow {
  status?: string;
  online?: boolean;
  labels?: ({ name?: string } | string)[];
}

function runnerList(body: unknown): RunnerRow[] {
  if (Array.isArray(body)) return body as RunnerRow[];
  if (body && typeof body === 'object') {
    const record = body as { runners?: unknown; entries?: unknown };
    if (Array.isArray(record.runners)) return record.runners as RunnerRow[];
    if (Array.isArray(record.entries)) return record.entries as RunnerRow[];
  }
  return [];
}

function online(runner: RunnerRow): boolean {
  if (runner.online === true) return true;
  const status = (runner.status ?? '').toLowerCase();
  return status === 'online' || status === 'idle' || status === 'active';
}

function labelsOf(runner: RunnerRow): string[] {
  return (runner.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name ?? '')).map((label) => label.toLowerCase());
}

function hasXiao(runner: RunnerRow): boolean {
  return labelsOf(runner).some((label) => label === 'xiao' || label.startsWith('xiao:'));
}

/** 连接后看 Actions 和构建机。不改远端，只读。 */
export async function probeGiteaActions(
  remoteUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ActionsProbe> {
  const remote = parseGiteaRemote(remoteUrl);
  if (!remote) return { state: 'unknown', detail: '仓库地址解析不了，没法检查构建机。' };
  const headers = { Authorization: `token ${token}` };
  try {
    const repo = await fetchImpl(`${remote.origin}/api/v1/repos/${remote.owner}/${remote.repo}`, { headers });
    if (repo.status === 404) return { state: 'unknown', detail: '仓库不存在，或令牌看不到这个仓库。' };
    if (!repo.ok) return { state: 'unknown', detail: `查仓库失败（HTTP ${repo.status}）。` };
    const repoBody = (await repo.json()) as { has_actions?: boolean; owner?: { type?: string } };
    if (repoBody.has_actions === false) {
      return { state: 'disabled', detail: '这个仓库没有开启 Actions。推送后不会构建。' };
    }
    const urls = [`${remote.origin}/api/v1/repos/${remote.owner}/${remote.repo}/actions/runners`];
    urls.push(
      repoBody.owner?.type === 'Organization'
        ? `${remote.origin}/api/v1/orgs/${remote.owner}/actions/runners`
        : `${remote.origin}/api/v1/user/actions/runners`,
    );
    const lists: RunnerRow[] = [];
    for (const url of urls) {
      const response = await fetchImpl(url, { headers });
      if (response.status === 404) continue;
      if (!response.ok) return { state: 'unknown', detail: `查构建机失败（HTTP ${response.status}）。` };
      lists.push(...runnerList(await response.json()));
    }
    const alive = lists.filter(online);
    const matched = alive.filter(hasXiao);
    if (matched.length > 0) return { state: 'ready', detail: '带 xiao 标签的构建机在线。' };
    if (alive.length > 0) return { state: 'no-runner', detail: '构建机缺少 xiao 标签。' };
    return { state: 'no-runner', detail: '没有在线的构建机。推送后不会开始构建，这次不能算上线。' };
  } catch (error) {
    return { state: 'unknown', detail: `连不上 Gitea：${error instanceof Error ? error.message : '网络失败'}` };
  }
}
