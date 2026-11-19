import {
  giteaNewRepoLink,
  giteaPagesUrl,
  giteaTokenLink,
  githubNewRepoLink,
  githubPagesUrl,
  githubTokenLink,
  type TokenReport,
} from './publish-token.ts';

export type PrepStep = 'platform' | 'token' | 'repo' | 'site' | 'build' | 'publish';
export type PrepFlag = 'idle' | 'ok' | 'manual' | 'warn';

export interface PrepDraft {
  step: PrepStep;
  done: PrepStep[];
  provider: '' | 'github' | 'gitea';
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

export const PREP_ORDER: PrepStep[] = ['platform', 'token', 'repo', 'site', 'build'];

export function blankPrep(): PrepDraft {
  return {
    step: 'platform',
    done: [],
    provider: '',
    origin: '',
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

export function tokenPage(draft: PrepDraft): string {
  return draft.provider === 'gitea' ? giteaTokenLink(draft.origin) : githubTokenLink();
}

export function newRepoPage(draft: PrepDraft, name = ''): string {
  if (draft.provider === 'gitea') return giteaNewRepoLink(draft.origin);
  return githubNewRepoLink(draft.report?.account || '', name);
}

export function canCreateRepo(report: TokenReport | null): boolean {
  return Boolean(report?.capabilities.some((item) => item.key === 'create' && item.state === 'ok'));
}

export function pushBlocks(report: TokenReport): boolean {
  return report.capabilities.some((item) => item.key === 'push' && item.state === 'missing');
}

/** 换平台会清掉后面的选择，已粘贴的令牌留下。失败时不清。 */
export function choosePlatform(draft: PrepDraft, provider: 'github' | 'gitea', origin = ''): PrepDraft {
  const nextOrigin = provider === 'github' ? 'https://github.com' : origin.trim().replace(/\/$/, '');
  if (provider === 'gitea' && !/^https?:\/\//i.test(nextOrigin)) {
    return stay(
      { ...draft, provider: 'gitea', origin: origin.trim() },
      '先填 Gitea 实例地址。',
      '例如 http://192.168.1.10:3000，填好后点继续。',
    );
  }
  const changed = draft.provider !== provider || (provider === 'gitea' && draft.origin !== nextOrigin);
  const base = changed ? { ...blankPrep(), token: draft.token } : draft;
  return advance({ ...base, provider, origin: nextOrigin }, 'token');
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
  return advance(draft, 'repo');
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
      '这个仓库不是空的，也没有 xiao.config.json。继续会把站点文件推上去。',
      '确认这就是要发布的仓库后再继续。',
    );
  }
  return advance(next, 'site');
}

export function suggestSite(draft: PrepDraft, staticHost = ''): { siteUrl: string; base: string; needHost: boolean } {
  if (draft.provider === 'github' && draft.owner && draft.repo) {
    return { ...githubPagesUrl(draft.owner, draft.repo), needHost: false };
  }
  const host = (staticHost || draft.staticHost).trim();
  if (!host || !draft.owner || !draft.repo) return { siteUrl: '', base: '', needHost: true };
  return { ...giteaPagesUrl(host, draft.owner, draft.repo), needHost: false };
}

export function applySite(draft: PrepDraft, input: { siteUrl: string; base: string; staticHost?: string }): PrepDraft {
  const next = {
    ...draft,
    siteUrl: input.siteUrl,
    base: input.base,
    staticHost: (input.staticHost ?? draft.staticHost).trim(),
  };
  if (!input.siteUrl.trim() || !input.base.trim()) {
    return stay(next, '还没有网站地址。', draft.provider === 'gitea' ? '先填静态服务地址并探测。' : '先选好仓库，地址会自动算出来。');
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

export function tokenResultLine(report: TokenReport | null): string {
  if (!report?.account) return '令牌验证：已验证';
  const missing = report.capabilities.filter((item) => item.key !== 'create' && item.state === 'missing');
  if (missing.length > 0) return `令牌验证：${report.account}，缺少${missing.map((item) => item.label).join('、')}`;
  const unknown = report.capabilities.filter((item) => item.state === 'unknown');
  if (report.capabilities.length > 0 && unknown.length === 0) return `令牌验证：${report.account}，能力已确认`;
  return `令牌验证：${report.account}`;
}

export function stepLine(draft: PrepDraft, step: PrepStep): string {
  if (step === 'platform') return draft.provider === 'github' ? '平台：GitHub' : `平台：Gitea ${draft.origin}`;
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
