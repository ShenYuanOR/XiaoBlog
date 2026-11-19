import { parseGiteaRemote } from './publish-workflow.ts';

export interface FollowUpdate {
  phase: 'build' | 'live';
  state: 'run' | 'ok' | 'fail';
  detail: string;
  log?: string;
  url?: string;
}

interface RunRow {
  id?: number;
  status?: string;
  conclusion?: string;
  html_url?: string;
  head_sha?: string;
}

function runsOf(body: unknown): RunRow[] {
  if (Array.isArray(body)) return body as RunRow[];
  if (!body || typeof body !== 'object') return [];
  const record = body as { workflow_runs?: unknown; runs?: unknown };
  if (Array.isArray(record.workflow_runs)) return record.workflow_runs as RunRow[];
  if (Array.isArray(record.runs)) return record.runs as RunRow[];
  return [];
}

function phaseOf(run: RunRow): 'queued' | 'running' | 'success' | 'failure' {
  const conclusion = (run.conclusion ?? '').toLowerCase();
  const status = (run.status ?? '').toLowerCase();
  if (conclusion === 'success' || status === 'success') return 'success';
  if (conclusion === 'failure' || conclusion === 'cancelled' || status === 'failure') return 'failure';
  if (status === 'completed') return conclusion === 'success' ? 'success' : 'failure';
  if (/queue|waiting|pending|requested/.test(status)) return 'queued';
  if (/progress|running/.test(status)) return 'running';
  return 'queued';
}

/** 只留失败步骤正文：去掉时间戳、颜色、堆栈，并把容器里的站点目录换成相对路径。 */
export function extractFailureLog(raw: string): string {
  const plain = raw.replace(/\u001b\[[0-9;]*m/g, '');
  const lines = plain.split(/\r?\n/).map((line) => {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(line) && line.length > 29) return line.slice(29);
    return line;
  });
  const start = lines.findIndex((line) => line.includes('⭐ Run Main '));
  const stepName = start >= 0 ? (lines[start]?.split('⭐ Run Main ')[1] ?? '').trim() : '';
  const end = lines.findIndex((line, index) => index > start && line.includes('❌') && line.includes('Failure - Main'));
  const slice = start >= 0 ? lines.slice(start + 1, end > start ? end : undefined) : lines;
  const body = slice
    .map((line) => line.replace(/\/workspace\/[^/]+\/[^/]+\/site\//g, ''))
    .filter((line) => {
      const text = line.trim();
      if (!text) return false;
      if (text === 'Stack trace:' || text.startsWith('Stack trace')) return false;
      if (/^at\s/.test(text)) return false;
      return true;
    });
  return [`${stepName || '构建'}失败`, ...body].join('\n');
}

async function failureLog(
  origin: string,
  owner: string,
  repo: string,
  runId: number,
  token: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const headers = { Authorization: `token ${token}` };
  try {
    const jobs = await fetchImpl(`${origin}/api/v1/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, { headers });
    if (!jobs.ok) return '';
    const body = (await jobs.json()) as { jobs?: { id?: number; conclusion?: string; status?: string }[] };
    const failed =
      (body.jobs ?? []).find((job) => job.conclusion === 'failure' || job.status === 'failure') ?? body.jobs?.[0];
    if (!failed?.id) return '';
    const log = await fetchImpl(`${origin}/api/v1/repos/${owner}/${repo}/actions/jobs/${failed.id}/logs`, { headers });
    if (!log.ok) return '';
    const text = await log.text();
    if (text.startsWith('PK')) return '';
    return extractFailureLog(text);
  } catch {
    return '';
  }
}

/** 按提交号等这次构建。没有构建机或一直没有运行时直接说明，不空转。 */
export async function watchBuild(options: {
  remoteUrl: string;
  token: string;
  sha: string;
  actionsState?: string;
  actionsDetail?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<FollowUpdate> {
  const remote = parseGiteaRemote(options.remoteUrl);
  const page = remote ? `${remote.origin}/${remote.owner}/${remote.repo}/actions` : '';
  if (options.actionsState === 'disabled' || options.actionsState === 'no-runner') {
    return { phase: 'build', state: 'fail', detail: options.actionsDetail || '没有可用的构建机。', url: page };
  }
  if (!remote) return { phase: 'build', state: 'fail', detail: '仓库地址解析不了，没法查构建。', url: page };
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const headers = { Authorization: `token ${options.token}` };
  const listUrl = `${remote.origin}/api/v1/repos/${remote.owner}/${remote.repo}/actions/runs?head_sha=${encodeURIComponent(options.sha)}`;
  const started = now();
  let queuedAt: number | null = null;
  let runningAt: number | null = null;
  const missing = 'Gitea 没有为这次提交启动构建：构建配置可能写错（Gitea 不报错），或已被更新的提交取代';
  const noRunner = '没有构建机接这次任务（需要带 xiao 标签的在线构建机）。';
  while (now() - started <= 15 * 60 * 1000) {
    let response: Response;
    try {
      response = await fetchImpl(listUrl, { headers });
    } catch (error) {
      return {
        phase: 'build',
        state: 'fail',
        detail: `查构建失败：${error instanceof Error ? error.message : '网络失败'}`,
        url: page,
      };
    }
    if (response.status === 404) {
      return { phase: 'build', state: 'fail', detail: 'Gitea 没有这次提交的构建接口。确认仓库已开启 Actions。', url: page };
    }
    if (response.ok) {
      const runs = runsOf(await response.json()).filter((item) => !item.head_sha || item.head_sha === options.sha);
      const run = runs.reduce<RunRow | undefined>((best, item) => ((item.id ?? 0) >= (best?.id ?? -1) ? item : best), undefined);
      if (!run) {
        if (now() - started >= 90_000) return { phase: 'build', state: 'fail', detail: missing, url: page };
      } else {
        const kind = phaseOf(run);
        const runUrl = run.html_url || page;
        if (kind === 'success') return { phase: 'build', state: 'ok', detail: '远端构建成功。', url: runUrl };
        if (kind === 'failure') {
          const log = run.id ? await failureLog(remote.origin, remote.owner, remote.repo, run.id, options.token, fetchImpl) : '';
          return { phase: 'build', state: 'fail', detail: '远端构建失败。', log, url: runUrl };
        }
        if (kind === 'queued') {
          queuedAt ??= now();
          if (now() - queuedAt >= 90_000) return { phase: 'build', state: 'fail', detail: noRunner, url: runUrl };
        } else {
          runningAt ??= now();
          if (now() - runningAt >= 15 * 60 * 1000) {
            return { phase: 'build', state: 'fail', detail: '构建超过 15 分钟还没结束。', url: runUrl };
          }
        }
      }
    }
    await sleep(3000);
  }
  return { phase: 'build', state: 'fail', detail: missing, url: page };
}

/** 打开站点首页，直到读到这次提交的 xiao-build。大约 5 分钟。 */
export async function waitForLive(options: {
  siteUrl: string;
  sha: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
}): Promise<FollowUpdate> {
  const siteUrl = options.siteUrl.trim();
  if (!siteUrl) {
    return { phase: 'live', state: 'fail', detail: '还没填站点网址，没法确认页面已经上线。' };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 60;
  const seen = (html: string): boolean => {
    const one = new RegExp(`<meta[^>]*name=["']xiao-build["'][^>]*content=["']${options.sha}["']`, 'i');
    const two = new RegExp(`<meta[^>]*content=["']${options.sha}["'][^>]*name=["']xiao-build["']`, 'i');
    return one.test(html) || two.test(html);
  };
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetchImpl(siteUrl);
      if (response.ok) {
        const html = await response.text();
        if (seen(html)) {
          return { phase: 'live', state: 'ok', detail: '页面上已经是这次发布的版本。', url: siteUrl };
        }
      }
    } catch {
      // 静态服务还没起来时继续等。
    }
    if (index < attempts - 1) await sleep(5000);
  }
  return {
    phase: 'live',
    state: 'fail',
    detail: '等了约 5 分钟，页面上还没有这次的版本号。静态服务可能还没接上，或者还没读到 pages 分支。',
    url: siteUrl,
  };
}
