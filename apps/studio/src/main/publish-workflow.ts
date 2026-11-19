import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const WORKFLOW_VERSION = 1;
export const WORKFLOW_PATH = '.gitea/workflows/xiao-deploy.yml';

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
permissions:
  contents: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: 取出源码
        uses: actions/checkout@v4
      - name: 准备 Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: 安装依赖
        run: corepack enable && corepack pnpm install --frozen-lockfile
      - name: 构建
        run: corepack pnpm exec astro build
        env:
          XIAO_BUILD_SHA: \${{ github.sha }}
      - name: 推到 pages 分支
        run: |
          set -eu
          cd dist
          git init
          git config user.name "晓"
          git config user.email "xiao@localhost"
          git add -A
          git commit -m "发布 \${XIAO_BUILD_SHA}"
          server="\${{ github.server_url }}"
          scheme="\${server%%://*}"
          host="\${server#*://}"
          git push --force "\${scheme}://x-access-token:\${{ github.token }}@\${host}/\${{ github.repository }}.git" HEAD:pages
        env:
          XIAO_BUILD_SHA: \${{ github.sha }}
`;
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
  return (runner.status ?? '').toLowerCase() === 'online' || (runner.status ?? '').toLowerCase() === 'idle';
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
    const repoBody = (await repo.json()) as { has_actions?: boolean };
    if (repoBody.has_actions === false) {
      return { state: 'disabled', detail: '这个仓库没有开启 Actions。推送后不会构建。' };
    }
    const runners = await fetchImpl(
      `${remote.origin}/api/v1/repos/${remote.owner}/${remote.repo}/actions/runners`,
      { headers },
    );
    if (runners.status === 404) {
      return { state: 'disabled', detail: 'Gitea 没有提供构建机接口。多半是没开启 Actions。' };
    }
    if (!runners.ok) return { state: 'unknown', detail: `查构建机失败（HTTP ${runners.status}）。` };
    const list = runnerList(await runners.json());
    if (!list.some(online)) {
      return { state: 'no-runner', detail: '没有在线的构建机。推送后不会开始构建，这次不能算上线。' };
    }
    return { state: 'ready', detail: '构建机在线。' };
  } catch (error) {
    return { state: 'unknown', detail: `连不上 Gitea：${error instanceof Error ? error.message : '网络失败'}` };
  }
}
