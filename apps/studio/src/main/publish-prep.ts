import {
  githubNewRepoLink,
  githubPagesUrl,
  githubTokenLink,
  type CapabilityKey,
  type TokenReport,
} from './publish-token.ts';

export type PrepStep = 'token' | 'repo' | 'site' | 'build' | 'publish';
export type PrepFlag = 'idle' | 'ok' | 'manual' | 'warn';

export interface PrepDraft {
  step: PrepStep;
  done: PrepStep[];
  provider: 'github';
  origin: string;
  token: string;
  report: TokenReport | null;
  remoteUrl: string;
  owner: string;
  repo: string;
  branch: string;
  empty: boolean | null;
  xiao: boolean | null;
  isPrivate: boolean;
  foreignConfirmed: boolean;
  siteUrl: string;
  base: string;
  staticHost: string;
  workflow: PrepFlag;
  hosting: PrepFlag;
  runner: PrepFlag;
  error: string;
  next: string;
  manualLink: string;
}

export const PREP_ORDER: PrepStep[] = ['repo', 'token', 'site', 'build', 'publish'];

const STEP_TITLES: Record<PrepStep, string> = {
  token: '令牌验证',
  repo: '仓库',
  site: '网站地址',
  build: '构建准备',
  publish: '首次发布',
};

export function stepTitle(step: PrepStep): string {
  return STEP_TITLES[step];
}

export function stepPhase(current: PrepStep, step: PrepStep, done: PrepStep[]): 'current' | 'done' | 'later' {
  if (step === current) return 'current';
  if (done.includes(step)) return 'done';
  return 'later';
}

export function blankPrep(): PrepDraft {
  return {
    step: 'repo',
    done: [],
    provider: 'github',
    origin: 'https://github.com',
    token: '',
    report: null,
    remoteUrl: '',
    owner: '',
    repo: '',
    branch: 'main',
    empty: null,
    xiao: null,
    isPrivate: false,
    foreignConfirmed: false,
    siteUrl: '',
    base: '',
    staticHost: '',
    workflow: 'idle',
    hosting: 'idle',
    runner: 'idle',
    error: '',
    next: '',
    manualLink: '',
  };
}

function clearHint(draft: PrepDraft): PrepDraft {
  return { ...draft, error: '', next: '', manualLink: '' };
}

function stay(draft: PrepDraft, error: string, next: string, manualLink = ''): PrepDraft {
  return { ...draft, error, next, manualLink };
}

function advance(draft: PrepDraft, step: PrepStep): PrepDraft {
  const done = draft.done.includes(draft.step) ? draft.done : [...draft.done, draft.step];
  return clearHint({ ...draft, step, done });
}

export function tokenPage(_draft: PrepDraft): string {
  return githubTokenLink();
}

export function newRepoPage(draft: PrepDraft, name = ''): string {
  return githubNewRepoLink(draft.report?.account || draft.owner, name);
}

export function canCreateRepo(report: TokenReport | null): boolean {
  return Boolean(report?.capabilities.some((item) => item.key === 'create' && item.state === 'ok'));
}

export function pushBlocks(report: TokenReport): boolean {
  return report.capabilities.some((item) => item.key === 'push' && item.state === 'missing');
}

/** 验证结果先留在这一步，让人看完能力再继续。失效和不能推送则停住。 */
export function applyTokenReport(draft: PrepDraft, report: TokenReport): PrepDraft {
  const next = { ...draft, report };
  const link = tokenPage(draft);
  if (report.status === 'invalid') return stay(next, '令牌已失效', '换一个令牌再验证。', link);
  if (report.status === 'expired') return stay(next, '令牌已过期', '去创建令牌，再粘贴新的。', link);
  if (report.status === 'valid' && pushBlocks(report)) {
    return stay(next, '缺少：推送内容', '去创建令牌并勾上仓库写权限，再回来验证。', link);
  }
  return clearHint(next);
}

export function acceptToken(draft: PrepDraft): PrepDraft {
  if (!draft.report || draft.report.status !== 'valid' || pushBlocks(draft.report)) return draft;
  return advance(draft, 'site');
}

export interface RepoPick {
  remoteUrl: string;
  owner: string;
  repo: string;
  branch: string;
  empty: boolean;
  xiao: boolean;
  isPrivate: boolean;
  confirmed?: boolean;
}

export function applyRepo(draft: PrepDraft, info: RepoPick): PrepDraft {
  const next: PrepDraft = {
    ...draft,
    remoteUrl: info.remoteUrl,
    owner: info.owner,
    repo: info.repo,
    branch: info.branch || 'main',
    empty: info.empty,
    xiao: info.xiao,
    isPrivate: info.isPrivate,
    foreignConfirmed: Boolean(info.confirmed),
  };
  if (draft.provider === 'github' && info.isPrivate) {
    return stay(next, '这个仓库是私有的。免费账户的 GitHub Pages 只给公开仓库。', '换一个公开仓库，或改成公开后再检查。');
  }
  if (!info.empty && !info.xiao && !info.confirmed) {
    return stay(
      next,
      '这个仓库已有别的内容，发布会被拒绝；选择覆盖会丢掉它现有的内容。',
      '确认这就是要发布的仓库后再继续。',
    );
  }
  return advance(next, 'token');
}

export function suggestSite(draft: PrepDraft): { siteUrl: string; base: string; needHost: boolean } {
  if (draft.owner && draft.repo) return { ...githubPagesUrl(draft.owner, draft.repo), needHost: false };
  return { siteUrl: '', base: '', needHost: true };
}

export function applySite(draft: PrepDraft, input: { siteUrl: string; base: string; staticHost?: string }): PrepDraft {
  const next = {
    ...draft,
    siteUrl: input.siteUrl,
    base: input.base,
    staticHost: (input.staticHost ?? draft.staticHost).trim(),
  };
  if (!input.siteUrl.trim() || !input.base.trim()) {
    return stay(next, '还没有网站地址。', '先选好仓库，地址会自动算出来。');
  }
  return advance(next, 'build');
}

export interface BuildResult {
  workflow: PrepFlag;
  hosting: PrepFlag;
  runner: PrepFlag;
  error?: string;
  next?: string;
  link?: string;
}

export function applyBuild(draft: PrepDraft, input: BuildResult): PrepDraft {
  const next: PrepDraft = {
    ...draft,
    workflow: input.workflow,
    hosting: input.hosting,
    runner: input.runner,
  };
  const blocked = input.workflow === 'manual' || input.hosting === 'manual' || input.runner === 'warn' || Boolean(input.error);
  if (blocked) {
    return stay(
      next,
      input.error || '还有一项要在网页上完成。',
      input.next || '做完后点「我已完成，重新检查」。',
      input.link || '',
    );
  }
  return advance(next, 'publish');
}

export function reopen(draft: PrepDraft, step: PrepStep): PrepDraft {
  if (draft.step !== step && !draft.done.includes(step)) return draft;
  return clearHint({ ...draft, step });
}

const CAPABILITY_KEYS: CapabilityKey[] = ['push', 'workflow', 'hosting', 'actions', 'create'];

export function asTokenReport(data: {
  status: TokenReport['status'];
  account: string;
  kind: TokenReport['kind'];
  expiresAt: string;
  message: string;
  capabilities: { key: string; label: string; state: TokenReport['capabilities'][number]['state']; how: string }[];
}): TokenReport {
  return {
    status: data.status,
    account: data.account,
    kind: data.kind,
    expiresAt: data.expiresAt,
    message: data.message,
    capabilities: data.capabilities.flatMap((item) => {
      if (!CAPABILITY_KEYS.includes(item.key as CapabilityKey)) return [];
      return [{ key: item.key as CapabilityKey, label: item.label, state: item.state, how: item.how }];
    }),
  };
}

export function tokenResultLine(report: TokenReport | null): string {
  if (!report?.account) return '令牌验证：已验证';
  const missing = report.capabilities.filter((item) => item.key !== 'create' && item.state === 'missing');
  if (missing.length > 0) return `令牌验证：${report.account}，缺少${missing.map((item) => item.label).join('、')}`;
  const unknown = report.capabilities.filter((item) => item.state === 'unknown');
  if (report.capabilities.length > 0 && unknown.length === 0) return `令牌验证：${report.account}，能力已确认`;
  return `令牌验证：${report.account}`;
}

export function stepLine(draft: PrepDraft, step: PrepStep): string {
  if (step === 'token') return tokenResultLine(draft.report);
  if (step === 'repo') return `仓库：${draft.owner}/${draft.repo}`;
  if (step === 'site') return `网站：${draft.siteUrl}`;
  if (step === 'build') return '构建准备：已完成';
  return '首次发布';
}

export function parseRepoUrl(text: string, origin = 'https://github.com'): { owner: string; repo: string; remoteUrl: string } | null {
  const trimmed = text.trim().replace(/\.git$/, '').replace(/\/$/, '');
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);
      const repo = parts.at(-1) ?? '';
      const owner = parts.at(-2) ?? '';
      if (!owner || !repo) return null;
      return { owner, repo, remoteUrl: `${url.origin}/${owner}/${repo}` };
    } catch {
      return null;
    }
  }
  const short = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (!short?.[1] || !short[2]) return null;
  return { owner: short[1], repo: short[2], remoteUrl: `${origin.replace(/\/$/, '')}/${short[1]}/${short[2]}` };
}
