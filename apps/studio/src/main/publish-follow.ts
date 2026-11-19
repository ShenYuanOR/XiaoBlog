import { parseGitRemote } from './publish-workflow.ts';

export interface FollowUpdate {
  phase: 'build' | 'live';
  state: 'run' | 'ok' | 'fail';
  detail: string;
  log?: string;
  url?: string;
  /** 远端构建用 Gitea 的开始到结束；没有时间戳时才是本地计时。 */
  ms?: number;
}

interface RunRow {
  id?: number;
  status?: string;
  conclusion?: string;
  html_url?: string;
  head_sha?: string;
  started_at?: string;
  completed_at?: string;
  run_started_at?: string;
  updated_at?: string;
}

/** 优先用运行记录上的开始和结束时间。缺任何一个就退回本地计时。 */
export function runDurationMs(
  run: { started_at?: string; completed_at?: string; run_started_at?: string; updated_at?: string },
  fallback: number,
): number {
  const start = Date.parse(run.started_at || run.run_started_at || '');
  const end = Date.parse(run.completed_at || '');
  if (Number.isFinite(start) && Number.isFinite(end) && end >= start) return end - start;
  return fallback;
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

/**
 * GitHub Actions 文本日志。步骤名取最后一个 ##[group]Run，正文到 ##[error] 为止。
 * 目前用的是按公开格式写的合成样例，还没有真实失败日志。
 */
export function extractGithubFailureLog(raw: string): string {
  const lines = raw.split(/\r?\n/).map((line) =>
    line
      .replace(/\u001b\[[0-9;]*m/g, '')
      .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, ''),
  );
  let errorAt = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.includes('##[error]')) errorAt = index;
  }
  const limit = errorAt >= 0 ? errorAt : lines.length;
  let groupAt = -1;
  for (let index = 0; index < limit; index += 1) {
    if (lines[index]?.includes('##[group]Run ')) groupAt = index;
  }
  const stepName = groupAt >= 0 ? (lines[groupAt]?.split('##[group]Run ').pop() ?? '').trim() : '';
  let bodyStart = 0;
  if (groupAt >= 0) {
    let endGroup = -1;
    for (let index = groupAt + 1; index < limit; index += 1) {
      if (lines[index]?.includes('##[endgroup]')) {
        endGroup = index;
        break;
      }
    }
    bodyStart = endGroup >= 0 ? endGroup + 1 : groupAt + 1;
  }
  const kept: string[] = [];
  for (const line of lines.slice(bodyStart, limit)) {
    const text = line.trim();
    if (!text || text.startsWith('shell:') || text === stepName) continue;
    kept.push(text);
  }
  const errorLine = errorAt >= 0 ? (lines[errorAt]?.replace('##[error]', '').trim() ?? '') : '';
  return [`${stepName || '构建'}失败`, ...kept, errorLine].filter(Boolean).join('\n');
}

function githubHost(origin: string): boolean {
  try {
    return /(^|\.)github\.com$/i.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

async function failureLog(
  owner: string,
  repo: string,
  runId: number,
  token: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'XiaoBlog' };
  const jobsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`;
  try {
    const jobs = await fetchImpl(jobsUrl, { headers });
    if (!jobs.ok) return '';
    const body = (await jobs.json()) as {
      jobs?: { id?: number; conclusion?: string; status?: string; steps?: { name?: string; conclusion?: string }[] }[];
    };
    const failed =
      (body.jobs ?? []).find((job) => job.conclusion === 'failure' || job.status === 'failure') ?? body.jobs?.[0];
    if (!failed?.id) return '';
    const failedStep = (failed.steps ?? []).find((step) => step.conclusion === 'failure')?.name ?? '';
    const logUrl = `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${failed.id}/logs`;
    const log = await fetchImpl(logUrl, { headers });
    if (!log.ok) return failedStep ? `${failedStep}失败` : '';
    const text = await log.text();
    if (text.startsWith('PK')) return failedStep ? `${failedStep}失败\n日志是压缩包，打开构建页面看完整记录。` : '';
    const extracted = extractGithubFailureLog(text);
    if (!failedStep) return extracted;
    const logBody = extracted.replace(/^[^\n]*失败\n?/, '');
    return [`${failedStep}失败`, logBody].filter(Boolean).join('\n');
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
  const remote = parseGitRemote(options.remoteUrl);
  const page = remote ? `https://github.com/${remote.owner}/${remote.repo}/actions` : '';
  if (!remote || !githubHost(remote.origin)) {
    return { phase: 'build', state: 'fail', detail: '只发布到 GitHub。', url: page };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const headers = { Authorization: `Bearer ${options.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'XiaoBlog' };
  const listUrl = `https://api.github.com/repos/${remote.owner}/${remote.repo}/actions/runs?head_sha=${encodeURIComponent(options.sha)}`;
  const started = now();
  let queuedAt: number | null = null;
  let runningAt: number | null = null;
  const missing = 'GitHub 没有为这次提交启动构建。确认 Actions 已开启，并且构建配置已经在默认分支上。';
  const noRunner = '构建还在排队，GitHub 暂时没有分到机器。';
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
      return {
        phase: 'build',
        state: 'fail',
        detail: 'GitHub 没有这次提交的构建记录。确认仓库已开启 Actions。',
        url: page,
      };
    }
    if (response.ok) {
      const runs = runsOf(await response.json()).filter((item) => !item.head_sha || item.head_sha === options.sha);
      const run = runs.reduce<RunRow | undefined>((best, item) => ((item.id ?? 0) >= (best?.id ?? -1) ? item : best), undefined);
      if (!run) {
        if (now() - started >= 90_000) return { phase: 'build', state: 'fail', detail: missing, url: page };
      } else {
        const kind = phaseOf(run);
        const runUrl = run.html_url || page;
        if (kind === 'success') {
          return {
            phase: 'build',
            state: 'ok',
            detail: '远端构建成功。',
            url: runUrl,
            ms: runDurationMs(run, now() - started),
          };
        }
        if (kind === 'failure') {
          const log = run.id
            ? await failureLog(remote.owner, remote.repo, run.id, options.token, fetchImpl)
            : '';
          return {
            phase: 'build',
            state: 'fail',
            detail: '远端构建失败。',
            log,
            url: runUrl,
            ms: runDurationMs(run, now() - started),
          };
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
  provider?: 'github' | 'gitea';
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
    detail:
      options.provider === 'github'
        ? '等了约 5 分钟，页面上还没有这次的版本号。GitHub Pages 首次部署通常要 1～2 分钟，CDN 也可能再拖一会儿。'
        : '等了约 5 分钟，页面上还没有这次的版本号。静态服务可能还没接上，或者还没读到 pages 分支。',
    url: siteUrl,
  };
}
