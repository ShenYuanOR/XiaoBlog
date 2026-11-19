import type { PreflightItem } from './publish-preflight.ts';
import { historyConclusion } from './release-gate.ts';
import type { DeployRecord, DeployStepNote } from './release-gate.ts';

export type JobStepKey = 'check' | 'push' | 'build' | 'live';
export type JobStepState = 'wait' | 'run' | 'ok' | 'fail' | 'skip';
export type JobStatus = 'running' | 'ok' | 'fail';

export interface JobStep {
  key: JobStepKey;
  label: string;
  state: JobStepState;
  startedAt: number;
  ms: number;
  detail: string;
  more: string;
  url: string;
  action: PreflightItem['action'];
  slug: string;
}

export interface PublishJobSnapshot {
  id: string;
  siteDir: string;
  status: JobStatus;
  steps: JobStep[];
  sha: string;
  pushRejected: boolean;
  startedAt: number;
  finishedAt: number;
  siteUrl: string;
  /** REPO_BROKEN 时界面打开修复弹窗。 */
  code: string;
  checks: PreflightItem[];
}

export interface PublishJobHooks {
  now: () => number;
  preflight: (siteDir: string) => Promise<{ ok: true; items: PreflightItem[] } | { ok: false; message: string }>;
  push: (
    siteDir: string,
    force: boolean,
  ) => Promise<{ ok: true; sha: string } | { ok: false; message: string; code?: string }>;
  follow: (
    siteDir: string,
    sha: string,
  ) => Promise<
    | {
        ok: true;
        build: { state: 'ok' | 'fail'; detail: string; log?: string; url?: string; ms: number };
        live: { state: 'ok' | 'fail'; detail: string; url?: string; ms: number } | null;
      }
    | { ok: false; message: string; ms: number }
  >;
  target: (siteDir: string) => { remoteUrl: string; siteUrl?: string } | null;
  record: (siteDir: string, row: DeployRecord) => void;
  emit: (siteDir: string, job: PublishJobSnapshot | null) => void;
}

const STEP_LABEL: Record<JobStepKey, string> = {
  check: '检查',
  push: '推送',
  build: '远端构建',
  live: '上线',
};

function blankStep(key: JobStepKey): JobStep {
  return {
    key,
    label: STEP_LABEL[key],
    state: 'wait',
    startedAt: 0,
    ms: 0,
    detail: '',
    more: '',
    url: '',
    action: '',
    slug: '',
  };
}

function cloneJob(job: PublishJobSnapshot): PublishJobSnapshot {
  return {
    ...job,
    steps: job.steps.map((step) => ({ ...step })),
    checks: job.checks.map((item) => ({ ...item })),
  };
}

function stepOf(job: PublishJobSnapshot, key: JobStepKey): JobStep {
  const found = job.steps.find((step) => step.key === key);
  if (!found) throw new Error(`缺少步骤 ${key}`);
  return found;
}

export function activeStep(job: PublishJobSnapshot): JobStep | undefined {
  return job.steps.find((step) => step.state === 'run');
}

/** 退出时：推送或检查要确认；远端构建和上线只提示不再跟踪。 */
export function quitKind(jobs: PublishJobSnapshot[]): 'confirm' | 'track' | null {
  const running = jobs.filter((job) => job.status === 'running');
  const key = running.map((job) => activeStep(job)?.key);
  if (key.some((item) => item === 'push' || item === 'check')) return 'confirm';
  if (key.some((item) => item === 'build' || item === 'live')) return 'track';
  return null;
}

export function createPublishJobs(hooks: PublishJobHooks): {
  start: (siteDir: string, force?: boolean) => PublishJobSnapshot;
  job: (siteDir: string) => PublishJobSnapshot | null;
  dismiss: (siteDir: string) => void;
  list: () => PublishJobSnapshot[];
  settled: (siteDir: string) => Promise<void>;
} {
  const jobs = new Map<string, PublishJobSnapshot>();
  const pending = new Map<string, Promise<void>>();
  let sequence = 0;

  function touch(job: PublishJobSnapshot): void {
    hooks.emit(job.siteDir, cloneJob(job));
  }

  function finish(job: PublishJobSnapshot, status: 'ok' | 'fail', writeHistory: boolean): void {
    const now = hooks.now();
    for (const step of job.steps) {
      if (step.state === 'run') step.ms = Math.max(0, now - step.startedAt);
      if (step.state === 'wait' || step.state === 'run') step.state = 'skip';
    }
    job.status = status;
    job.finishedAt = now;
    if (writeHistory) {
      const target = hooks.target(job.siteDir);
      const steps: DeployStepNote[] = job.steps.map((step) => ({
        key: step.key,
        label: step.label,
        state: step.state === 'skip' ? 'wait' : step.state,
        ms: step.ms,
      }));
      hooks.record(job.siteDir, {
        at: new Date(now).toISOString(),
        repo: target?.remoteUrl ?? '',
        sha: job.sha,
        result: historyConclusion({ steps }),
        ms: now - job.startedAt,
        steps,
      });
    }
    touch(job);
  }

  async function run(job: PublishJobSnapshot, force: boolean): Promise<void> {
    const check = stepOf(job, 'check');
    check.state = 'run';
    check.startedAt = hooks.now();
    check.detail = '正在构建并检查';
    touch(job);
    const checked = await hooks.preflight(job.siteDir);
    check.ms = Math.max(0, hooks.now() - check.startedAt);
    if (!checked.ok) {
      check.state = 'fail';
      check.detail = checked.message || '检查没有完成，不能发布';
      job.checks = [
        {
          key: 'build',
          ok: false,
          label: '站点能构建',
          detail: check.detail,
          more: '',
          slug: '',
          action: '',
        },
      ];
      finish(job, 'fail', false);
      return;
    }
    job.checks = checked.items;
    const failed = checked.items.find((item) => !item.ok);
    if (checked.items.length === 0 || failed) {
      check.state = 'fail';
      check.detail = failed?.detail || '检查没有完成，不能发布';
      check.more = failed?.more ?? '';
      check.action = failed?.action ?? '';
      check.slug = failed?.slug ?? '';
      finish(job, 'fail', false);
      return;
    }
    check.state = 'ok';
    check.detail = '没有挡住发布的错误';
    touch(job);

    const push = stepOf(job, 'push');
    push.state = 'run';
    push.startedAt = hooks.now();
    push.detail = '正在提交并推送';
    touch(job);
    const pushed = await hooks.push(job.siteDir, force);
    push.ms = Math.max(0, hooks.now() - push.startedAt);
    if (!pushed.ok) {
      push.state = 'fail';
      push.detail = pushed.message || '推送没有完成';
      job.pushRejected = /覆盖远端|快进|non-fast-forward|force/i.test(push.detail);
      job.code = pushed.code ?? '';
      finish(job, 'fail', false);
      return;
    }
    job.sha = pushed.sha;
    push.state = 'ok';
    push.detail = pushed.sha ? `已推送 ${pushed.sha.slice(0, 7)}` : '已推送';
    touch(job);

    const build = stepOf(job, 'build');
    build.state = 'run';
    build.startedAt = hooks.now();
    build.detail = job.sha ? '正在查看这次提交的构建' : '没有提交号，没法对照构建';
    touch(job);
    if (!job.sha) {
      build.state = 'fail';
      build.detail = '没有提交号';
      build.ms = Math.max(0, hooks.now() - build.startedAt);
      finish(job, 'fail', true);
      return;
    }
    const followed = await hooks.follow(job.siteDir, job.sha);
    if (!followed.ok) {
      build.state = 'fail';
      build.detail = followed.message;
      build.ms = followed.ms;
      finish(job, 'fail', true);
      return;
    }
    build.state = followed.build.state === 'ok' ? 'ok' : 'fail';
    build.detail = followed.build.log || followed.build.detail;
    build.ms = followed.build.ms;
    build.url = followed.build.url ?? '';
    if (followed.live) {
      const live = stepOf(job, 'live');
      live.state = followed.live.state === 'ok' ? 'ok' : 'fail';
      live.detail = followed.live.detail;
      live.ms = followed.live.ms;
      live.url = followed.live.url ?? '';
      live.startedAt = hooks.now() - live.ms;
    }
    finish(job, stepOf(job, 'live').state === 'ok' ? 'ok' : 'fail', true);
  }

  return {
    start(siteDir: string, force = false): PublishJobSnapshot {
      const current = jobs.get(siteDir);
      if (current?.status === 'running') return cloneJob(current);
      const startedAt = hooks.now();
      sequence += 1;
      const target = hooks.target(siteDir);
      const job: PublishJobSnapshot = {
        id: `${sequence}`,
        siteDir,
        status: 'running',
        steps: (['check', 'push', 'build', 'live'] as JobStepKey[]).map(blankStep),
        sha: '',
        pushRejected: false,
        startedAt,
        finishedAt: 0,
        siteUrl: target?.siteUrl ?? '',
        code: '',
        checks: [],
      };
      jobs.set(siteDir, job);
      const task = run(job, force).finally(() => {
        if (pending.get(siteDir) === task) pending.delete(siteDir);
      });
      pending.set(siteDir, task);
      return cloneJob(job);
    },
    job(siteDir: string): PublishJobSnapshot | null {
      const current = jobs.get(siteDir);
      return current ? cloneJob(current) : null;
    },
    dismiss(siteDir: string): void {
      const current = jobs.get(siteDir);
      if (!current || current.status === 'running') return;
      jobs.delete(siteDir);
      hooks.emit(siteDir, null);
    },
    list(): PublishJobSnapshot[] {
      return [...jobs.values()].map(cloneJob);
    },
    settled(siteDir: string): Promise<void> {
      return pending.get(siteDir) ?? Promise.resolve();
    },
  };
}
