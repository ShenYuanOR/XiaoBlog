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

function tail(text: string): string {
  return text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .slice(-40)
    .join('\n');
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
    return tail(text);
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
  attempts?: number;
}): Promise<FollowUpdate> {
  const remote = parseGiteaRemote(options.remoteUrl);
  const page = remote ? `${remote.origin}/${remote.owner}/${remote.repo}/actions` : '';
  if (options.actionsState === 'disabled' || options.actionsState === 'no-runner') {
    return { phase: 'build', state: 'fail', detail: options.actionsDetail || '没有可用的构建机。', url: page };
  }
  if (!remote) return { phase: 'build', state: 'fail', detail: '仓库地址解析不了，没法查构建。', url: page };
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 40;
  const headers = { Authorization: `token ${options.token}` };
  const listUrl = `${remote.origin}/api/v1/repos/${remote.owner}/${remote.repo}/actions/runs?head_sha=${encodeURIComponent(options.sha)}`;
  for (let index = 0; index < attempts; index += 1) {
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
      const runs = runsOf(await response.json());
      const run = runs.find((item) => !item.head_sha || item.head_sha === options.sha);
      if (run) {
        const phase = phaseOf(run);
        const runUrl = run.html_url || page;
        if (phase === 'success') return { phase: 'build', state: 'ok', detail: '远端构建成功。', url: runUrl };
        if (phase === 'failure') {
          const log = run.id ? await failureLog(remote.origin, remote.owner, remote.repo, run.id, options.token, fetchImpl) : '';
          return { phase: 'build', state: 'fail', detail: '远端构建失败。', log, url: runUrl };
        }
        const detail = phase === 'queued' ? '构建在排队。' : '正在构建。';
        if (index === attempts - 1) return { phase: 'build', state: 'fail', detail: `${detail}等了太久还没结束。`, url: runUrl };
      } else if (index === attempts - 1) {
        return { phase: 'build', state: 'fail', detail: '这次提交还没有出现在 Actions 里。', url: page };
      }
    }
    await sleep(index === attempts - 1 ? 0 : 3000);
  }
  return { phase: 'build', state: 'fail', detail: '这次提交还没有出现在 Actions 里。', url: page };
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
