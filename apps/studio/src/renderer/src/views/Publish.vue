<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  acceptToken,
  asTokenReport,
  applyBuild,
  applyRepo,
  applySite,
  applyTokenReport,
  blankPrep,
  newRepoPage,
  parseRepoUrl,
  PREP_ORDER,
  pushBlocks,
  reopen,
  stepLine,
  stepPhase,
  stepTitle,
  suggestSite,
  tokenPage,
  type PrepStep,
} from '../../../main/publish-prep.ts';
import { tokenExpiryText, tokenKindLabel, tokenStatusLine } from '../../../main/publish-token.ts';
import { changeSummary, historyConclusion, historyStepDetail } from '../../../main/release-gate.ts';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { usePublish } from '../stores/publish.ts';
import { useSession } from '../stores/session.ts';
import { UiBadge, UiButton, UiDialog, UiEmpty, UiField, UiIcon, UiInput, UiSpinner } from '../ui/index.ts';

type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

interface FileChange {
  path: string;
  status: ChangeStatus;
  from?: string;
}

interface PostChange {
  slug: string;
  title: string;
  status: ChangeStatus;
  files: FileChange[];
}

interface ChangeSummary {
  posts: PostChange[];
  pages: FileChange[];
  settings: FileChange[];
  settingsStatus: ChangeStatus | null;
  other: FileChange[];
}

interface PreflightItem {
  key: 'url' | 'workflow' | 'build' | 'seo';
  ok: boolean;
  label: string;
  detail: string;
  more?: string;
  slug?: string;
  skip?: boolean;
  action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
}

interface DeployStepNote {
  key: 'check' | 'push' | 'build' | 'live';
  label: string;
  state: StepState;
  ms: number;
}

interface DeployRecord {
  at: string;
  repo: string;
  sha?: string;
  result?: string;
  ms?: number;
  steps?: DeployStepNote[];
}

interface DeployTarget {
  provider: 'gitea' | 'github';
  /** 旧的 Gitea 目标只用来提示改连 GitHub。 */
  remoteUrl: string;
  branch: string;
  login?: string;
  siteUrl?: string;
  actionsState?: 'ready' | 'disabled' | 'no-runner' | 'unknown';
  actionsDetail?: string;
  remoteEmpty?: boolean;
  persisted?: boolean;
}

interface PushResult {
  committed: boolean;
  forced: boolean;
  warnings: string[];
  message: string;
  remote: string;
  branch: string;
  sha: string;
}

type StepState = 'wait' | 'run' | 'ok' | 'fail';

interface StepRow {
  key: 'check' | 'push' | 'build' | 'live';
  label: string;
  state: StepState;
  detail: string;
  ms: number;
  startedAt: number;
  url?: string;
}

const session = useSession();
const publish = usePublish();

const emptyChanges = (): ChangeSummary => ({
  posts: [],
  pages: [],
  settings: [],
  settingsStatus: null,
  other: [],
});

const loading = ref(false);
const errorText = ref('');
const changes = ref<ChangeSummary>(emptyChanges());
const checks = ref<PreflightItem[]>([]);
const checking = ref(false);
const checkedAt = ref(0);
const history = ref<DeployRecord[]>([]);
const sitePostCount = ref(0);
const historyPersisted = ref(true);
const target = ref<DeployTarget | null>(null);
const tokenReport = ref<{
  status: 'valid' | 'invalid' | 'expired' | 'rejected';
  account: string;
  message: string;
  capabilities: { key: string; label: string; state: 'ok' | 'missing' | 'unknown'; how: string }[];
} | null>(null);
const prep = ref(blankPrep());

const repoQuery = ref('');

const heldTarget = ref<DeployTarget | null>(null);

const prepBusy = ref(false);
const siteUrlDraft = ref('');
const pushing = ref(false);
const pushError = ref('');
const pushResult = ref<PushResult | null>(null);
const forceOpen = ref(false);
const disconnectOpen = ref(false);
const repairOpen = ref(false);
const phase = ref<'ready' | 'running' | 'result'>('ready');
const steps = ref<StepRow[]>([]);
const filesOpen = ref(false);
const settingsOpen = ref(false);
const reconnectOpen = ref(false);
const reconnectToken = ref('');
const reconnecting = ref(false);
const historyAll = ref(false);
const moreKey = ref('');

const addedPosts = computed(() => changes.value.posts.filter((post) => post.status === 'added'));
const editedPosts = computed(() =>
  changes.value.posts.filter((post) => post.status === 'modified' || post.status === 'renamed'),
);
const deletedPosts = computed(() => changes.value.posts.filter((post) => post.status === 'deleted'));
const failedCheck = computed(() => checks.value.find((item) => !item.ok));
const liveOk = computed(() => steps.value.some((step) => step.key === 'live' && step.state === 'ok'));
const buildFailed = computed(() => steps.value.some((step) => step.key === 'build' && step.state === 'fail'));
const tokenBlocked = computed(
  () => tokenReport.value?.status === 'invalid' || tokenReport.value?.status === 'expired' || tokenReport.value?.status === 'rejected',
);
const blocked = computed(
  () => checking.value || checks.value.length === 0 || checks.value.some((item) => !item.ok) || tokenBlocked.value,
);
const historyRows = computed(() => [...history.value].slice(-20).reverse());
const checkedLabel = computed(() => {
  if (!checkedAt.value) return '';
  const minutes = Math.floor(Math.max(0, publish.now - checkedAt.value) / 60000);
  return minutes < 1 ? '刚刚检查' : `${minutes} 分钟前检查`;
});
const failedChecks = computed(() => checks.value.filter((item) => !item.ok && !item.skip));
const passedCount = computed(() => checks.value.filter((item) => item.ok && !item.skip).length);
const skippedChecks = computed(() => checks.value.filter((item) => item.skip));
const checksClear = computed(() => checks.value.length > 0 && failedChecks.value.length === 0);
const previewPosts = computed(() => changes.value.posts.slice(0, 3));
const shownHistory = computed(() => (historyAll.value ? historyRows.value : historyRows.value.slice(0, 5)));
const blockReason = computed(() => {
  if (checking.value) return '正在检查';
  if (!checks.value.length) return '还没有检查';
  return failedChecks.value[0]?.detail ?? '';
});
const failureView = computed(() => {
  const failed = steps.value.find((step) => step.state === 'fail');
  if (!failed) return { reason: '', log: '' };
  const [reason, ...rest] = failed.detail.split('\n');
  const extra = failed.key === 'check' ? failedCheck.value?.more ?? '' : '';
  return { reason: reason || failed.detail, log: [rest.join('\n'), extra].filter(Boolean).join('\n') };
});
const runnerBadge = computed((): { text: string; tone: 'ok' | 'warn' | 'neutral' } => {
  if (tokenBlocked.value) return { text: '令牌失效，无法确认', tone: 'neutral' };
  if (target.value?.provider === 'github') {
    return target.value.actionsState === 'ready'
      ? { text: 'GitHub 构建', tone: 'ok' }
      : { text: 'Pages 未开启', tone: 'warn' };
  }
  const state = target.value?.actionsState;
  const detail = target.value?.actionsDetail ?? '';
  if (state === 'ready') return { text: '构建机就绪', tone: 'ok' };
  if (detail.includes('xiao')) return { text: '缺少 xiao 标签', tone: 'warn' };
  if (state === 'no-runner' || state === 'disabled') return { text: '没有构建机', tone: 'warn' };
  return { text: '没有构建机', tone: 'neutral' };
});
const tokenStatusText = computed(() => tokenStatusLine(tokenReport.value, publish.now));
const pagesLabel = computed(() => {
  if (tokenBlocked.value) return '令牌失效，无法确认';
  if (target.value?.provider === 'github') {
    return target.value.actionsState === 'ready' ? 'Pages 已开启' : 'Pages 未开启';
  }
  return '页面在 pages 分支';
});
const needsForce = computed(() => /覆盖远端|快进|non-fast-forward|force/i.test(pushError.value));
const prepHelp: Record<PrepStep, { title: string; body: string }> = {
  repo: {
    title: '选仓库',
    body: '填 owner/repo 或仓库网址。公开仓库会看出是不是空的、是不是晓的站点。找不到可以去网页新建，或先继续。不是晓站点的非空仓库会先警告。',
  },
  token: {
    title: '令牌验证',
    body: '先在 GitHub 创建只授权这个仓库的细粒度令牌，再粘贴验证。经典令牌，以及能访问其他仓库的令牌，都不会通过。',
  },
  site: {
    title: '网站地址',
    body: '按仓库名计算。仓库名是 owner.github.io 时用根路径，否则挂在 /仓库名/。确认后写入站点配置。',
  },
  build: {
    title: '构建准备',
    body: '写入 GitHub Actions 构建配置，并把 Pages 的构建类型设成 workflow。做不到的会给你网页链接，做完点「我已完成，重新检查」。',
  },
  publish: {
    title: '首次发布',
    body: '点「开始首次发布」，按检查、推送、远端构建、上线走完。',
  },
};
const shownPrep = computed(() => PREP_ORDER);
const repoChosen = computed(() => Boolean(prep.value.remoteUrl && prep.value.owner && prep.value.repo && !prep.value.error.includes('没找到')));
const foreignWarn = computed(
  () => repoChosen.value && prep.value.empty === false && prep.value.xiao === false && !prep.value.foreignConfirmed && !prep.value.isPrivate,
);
const tokenCanContinue = computed(
  () => prep.value.report?.status === 'valid' && !pushBlocks(prep.value.report),
);
const suggestedSite = computed(() => suggestSite(prep.value));

const resultEntries = computed(() => {
  const failed = steps.value.find((step) => step.state === 'fail');
  const entries: { key: string; label: string; run: () => void }[] = [];
  if (!failed) return entries;
  if (failed.key === 'check') {
    const item = checks.value.find((row) => !row.ok);
    if (item?.action === 'apply-url') {
      entries.push({ key: 'url', label: '一键改成目标网址', run: () => void applyTargetUrl() });
    } else if (item?.key === 'url') {
      entries.push({ key: 'settings', label: '去设置', run: () => go('settings') });
    } else if (item?.action === 'open-post' && item.slug) {
      entries.push({ key: 'post', label: '打开这篇文章', run: () => openArticle(item.slug ?? '') });
    } else if (item?.action === 'seo') {
      entries.push({ key: 'seo', label: '去 SEO', run: () => go('seo') });
    }
  } else if (failed.key === 'push' && /令牌|认证|权限/.test(failed.detail)) {
    entries.push({
      key: 'reconnect',
      label: '重新连接',
      run: () => {
        reconnectOpen.value = true;
      },
    });
  } else if (failed.key === 'build' && failed.url) {
    entries.push({
      key: 'gitea',
      label: '在 GitHub 查看',
      run: () => void window.xiao.app.openExternal(failed.url ?? ''),
    });
  }
  return entries;
});

const summaryLine = computed(() => {
  const parts: string[] = [];
  if (addedPosts.value.length) parts.push(`${addedPosts.value.length} 篇新文章`);
  if (editedPosts.value.length) parts.push(`修改 ${editedPosts.value.length} 篇`);
  if (deletedPosts.value.length) parts.push(`删除 ${deletedPosts.value.length} 篇`);
  if (changes.value.settings.length) parts.push('站点设置有变化');
  if (changes.value.pages.length) parts.push('页面有变化');
  if (changes.value.other.length) parts.push('还有其他文件变化');
  return changeSummary({
    remoteEmpty: Boolean(target.value?.remoteEmpty),
    postCount: sitePostCount.value,
    parts,
  });
});

const fileLines = computed(() => {
  const lines: { key: string; text: string; deleted: boolean }[] = [];
  for (const post of changes.value.posts) {
    const mark = post.status === 'added' ? '新增' : post.status === 'deleted' ? '删除' : '修改';
    lines.push({ key: post.slug, text: `${mark}文章　${post.title}`, deleted: post.status === 'deleted' });
  }
  if (changes.value.settings.length) {
    lines.push({
      key: 'settings',
      text: `站点设置与样式　${changes.value.settings.length} 个文件`,
      deleted: false,
    });
  }
  for (const file of [...changes.value.pages, ...changes.value.other]) {
    const mark = file.status === 'added' ? '新增' : file.status === 'deleted' ? '删除' : '修改';
    lines.push({ key: file.path, text: `${mark}　${file.path}`, deleted: file.status === 'deleted' });
  }
  return lines;
});

function repoName(url: string): string {
  const parts = url.replace(/\.git$/, '').split('/').filter(Boolean);
  const repo = parts.at(-1) ?? url;
  const owner = parts.at(-2) ?? '';
  return owner ? `${owner}/${repo}` : repo;
}

function relativeTime(at: string): string {
  const then = new Date(at).getTime();
  if (Number.isNaN(then)) return at;
  const minutes = Math.round((publish.now - then) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function stepIcon(step: StepRow): string {
  if (step.state === 'ok') return icons.ok;
  if (step.state === 'fail') return icons.alert;
  if (step.state === 'run') return icons.refresh;
  return icons.more;
}

function stepMs(step: StepRow): number {
  if (step.state === 'run' && step.startedAt) return Math.max(0, publish.now - step.startedAt);
  return step.ms;
}

function go(nav: 'seo' | 'settings'): void {
  session.setNav(nav);
}

function openArticle(slug: string): void {
  if (!slug) return;
  session.activePost = slug;
  session.setNav('posts');
  window.dispatchEvent(new CustomEvent('xiao:open-post', { detail: { slug } }));
}

function openPublishedSite(): void {
  const url = target.value?.siteUrl || steps.value.find((step) => step.key === 'live')?.url || '';
  if (url) void window.xiao.app.openExternal(url);
}

function openBuildLog(): void {
  const url = steps.value.find((step) => step.key === 'build')?.url ?? '';
  if (url) void window.xiao.app.openExternal(url);
}

function finishPublish(): void {
  void dismissJob();
}

async function submitReconnect(): Promise<void> {
  if (!session.siteDir) return;
  const token = reconnectToken.value.trim();
  if (!token) {
    notify('先粘贴访问令牌。', 'error', 'publish-token');
    return;
  }
  reconnecting.value = true;
  try {
    const result = await window.xiao.publish.replaceToken(session.siteDir, token);
    if (!result.ok) {
      notify(result.message, 'error', 'publish-token');
      return;
    }
    tokenReport.value = result.data;
    if (result.data.status !== 'valid') {
      notify(result.data.message || '令牌已失效', 'error', 'publish-token');
      return;
    }
    reconnectToken.value = '';
    reconnectOpen.value = false;
    notify(`令牌验证通过：${result.data.account || '已连接'}`, 'info', 'publish-token');
    await runPreflight();
  } finally {
    reconnecting.value = false;
  }
}

function openLink(url: string): void {
  if (url) void window.xiao.app.openExternal(url);
}

function capabilityText(state: 'ok' | 'missing' | 'unknown'): string {
  if (state === 'ok') return '可以';
  if (state === 'missing') return '缺少';
  return '还不确定';
}

function capIcon(state: 'ok' | 'missing' | 'unknown'): string {
  if (state === 'ok') return icons.ok;
  if (state === 'missing') return icons.alert;
  return icons.help;
}

async function verifyPasted(): Promise<void> {
  const token = prep.value.token.trim();
  if (!token) {
    notify('先粘贴访问令牌。', 'error', 'publish-prep');
    return;
  }
  prepBusy.value = true;
  try {
    const result = await window.xiao.publish.checkToken('github', prep.value.remoteUrl, token);
    if (!result.ok) {
      notify(result.message, 'error', 'publish-prep');
      return;
    }
    prep.value = applyTokenReport({ ...prep.value, token }, asTokenReport(result.data));
  } finally {
    prepBusy.value = false;
  }
}

function clearRepoPick(): void {
  prep.value = {
    ...prep.value,
    remoteUrl: '',
    owner: '',
    repo: '',
    empty: null,
    xiao: null,
    isPrivate: false,
    foreignConfirmed: false,
    error: '',
    next: '',
    manualLink: '',
  };
}

function confirmForeign(): void {
  prep.value = applyRepo(prep.value, {
    remoteUrl: prep.value.remoteUrl,
    owner: prep.value.owner,
    repo: prep.value.repo,
    branch: prep.value.branch,
    empty: prep.value.empty === true,
    xiao: prep.value.xiao === true,
    isPrivate: prep.value.isPrivate,
    confirmed: true,
  });
}

async function useTypedRepo(): Promise<void> {
  const text = repoQuery.value.trim();
  if (!text) {
    notify('先填 owner/repo，或仓库网址。', 'error', 'publish-prep');
    return;
  }
  prepBusy.value = true;
  try {
    const result = await window.xiao.publish.lookup(text);
    if (!result.ok) {
      prep.value = { ...prep.value, error: result.message, next: '检查地址后再试。' };
      return;
    }
    const data = result.data;
    if (!data.found) {
      prep.value = {
        ...prep.value,
        remoteUrl: data.remoteUrl,
        owner: data.owner,
        repo: data.repo,
        branch: 'main',
        error: data.message,
        next: '可以去网页新建。建好后点「我已建好，重新检查」，或先继续，等令牌验证再确认。',
      };
      return;
    }
    prep.value = applyRepo(prep.value, {
      remoteUrl: data.remoteUrl,
      owner: data.owner,
      repo: data.repo,
      branch: data.branch,
      empty: data.empty,
      xiao: data.xiao,
      isPrivate: data.isPrivate,
    });
  } finally {
    prepBusy.value = false;
  }
}

function continueMissing(): void {
  prep.value = applyRepo(prep.value, {
    remoteUrl: prep.value.remoteUrl,
    owner: prep.value.owner,
    repo: prep.value.repo,
    branch: prep.value.branch || 'main',
    empty: false,
    xiao: false,
    isPrivate: false,
    missing: true,
  });
}

async function acceptSite(): Promise<void> {
  const suggested = suggestSite(prep.value);
  prep.value = applySite(prep.value, { siteUrl: suggested.siteUrl, base: suggested.base });
}

async function reconnectGithub(): Promise<void> {
  if (!session.siteDir) return;
  await window.xiao.publish.disconnect(session.siteDir);
  target.value = null;
  tokenReport.value = null;
  prep.value = blankPrep();
}

async function runPrepare(): Promise<void> {
  if (!session.siteDir) return;
  prepBusy.value = true;
  try {
    const result = await window.xiao.publish.prepare(session.siteDir, {
      provider: 'github',
      origin: prep.value.origin,
      remoteUrl: prep.value.remoteUrl,
      token: prep.value.token,
      login: prep.value.report?.account || '',
      branch: prep.value.branch,
      owner: prep.value.owner,
      repo: prep.value.repo,
      siteUrl: prep.value.siteUrl,
      base: prep.value.base,
      empty: prep.value.empty === true,
      recheck: Boolean(prep.value.manualLink || prep.value.error),
    });
    if (!result.ok) {
      prep.value = applyBuild(prep.value, {
        workflow: 'idle',
        hosting: 'idle',
        runner: 'idle',
        error: result.message,
        next: '这一步没有完成，已填内容还在。',
      });
      return;
    }
    prep.value = applyBuild(prep.value, {
      workflow: result.data.workflow,
      hosting: result.data.hosting,
      runner: result.data.runner,
      error: result.data.error,
      next: result.data.next,
      link: result.data.link,
    });
    if (result.data.target) {
      heldTarget.value = result.data.target;
      notify('构建准备完成。点「开始首次发布」进入四步。', 'info', 'publish-prep');
      if (result.data.target.persisted === false) {
        notify('令牌无法写入本机用户目录，只在本次运行有效。下次启动需要重新连接。', 'error', 'publish-persist');
      }
    } else if (prep.value.step === 'publish') {
      prep.value = { ...prep.value, step: 'build', error: '准备没有保存连接。', next: '再点一次重新检查。已填内容还在。' };
    }
  } finally {
    prepBusy.value = false;
  }
}

function applyJob(job: {
  status: 'running' | 'ok' | 'fail';
  steps: {
    key: 'check' | 'push' | 'build' | 'live';
    label: string;
    state: 'wait' | 'run' | 'ok' | 'fail' | 'skip';
    startedAt: number;
    ms: number;
    detail: string;
    url?: string;
  }[];
  pushRejected: boolean;
  code: string;
  checks: PreflightItem[];
} | null): void {
  if (!job) {
    phase.value = 'ready';
    steps.value = [];
    return;
  }
  phase.value = job.status === 'running' ? 'running' : 'result';
  steps.value = job.steps.map((step) => ({
    key: step.key,
    label: step.label,
    state: step.state === 'skip' ? 'wait' : step.state,
    detail: step.detail,
    ms: step.ms,
    startedAt: step.startedAt,
    url: step.url,
  }));
  if (job.checks.length) checks.value = job.checks;
  const push = job.steps.find((step) => step.key === 'push');
  pushError.value = job.pushRejected ? push?.detail || '' : '';
  if (job.code === 'REPO_BROKEN') repairOpen.value = true;
}

async function startFirstPublish(): Promise<void> {
  if (prep.value.report) tokenReport.value = prep.value.report;
  if (heldTarget.value) target.value = heldTarget.value;
  if (!target.value && session.siteDir) {
    const current = await window.xiao.publish.target(session.siteDir);
    if (current.ok && current.data) target.value = current.data;
  }
  await startPublish(false);
}

async function startPublish(force = false): Promise<void> {
  if (!session.siteDir || !target.value || checking.value) return;
  const result = await window.xiao.publish.start(session.siteDir, force);
  if (!result.ok) {
    notify(result.message, 'error', 'publish-job');
    return;
  }
  applyJob(result.data);
}

async function refreshChanges(): Promise<void> {
  if (!session.siteDir) return;
  const result = await window.xiao.publish.changes(session.siteDir);
  if (result.ok) changes.value = result.data;
}

async function dismissJob(): Promise<void> {
  if (session.siteDir) await window.xiao.publish.dismiss(session.siteDir);
  phase.value = 'ready';
  steps.value = [];
  await refreshChanges();
}

async function confirmRepair(): Promise<void> {
  repairOpen.value = false;
  if (!session.siteDir) return;
  const fixed = await window.xiao.publish.repair(session.siteDir);
  if (!fixed.ok) {
    notify(`修复失败：${fixed.message}`, 'error', 'publish-repair');
    return;
  }
  notify(`git 历史已重建，${fixed.data.files} 个文件。旧的 .git 备份在 ${fixed.data.backup}。`, 'info', 'publish-repair');
  await startPublish(false);
}

async function confirmDisconnect(): Promise<void> {
  disconnectOpen.value = false;
  if (!session.siteDir) return;
  const result = await window.xiao.publish.disconnect(session.siteDir);
  if (!result.ok) {
    notify(`断开连接失败：${result.message}`, 'error', 'publish-connect');
    return;
  }
  target.value = null;
  heldTarget.value = null;
  prep.value = blankPrep();
  pushResult.value = null;
  pushError.value = '';
  phase.value = 'ready';
  steps.value = [];
  notify('已断开远端连接，并删除这个站点在本机保存的令牌。', 'info', 'publish-connect');
}

async function runPreflight(force = false): Promise<void> {
  if (!session.siteDir) return;
  checking.value = true;
  try {
    const result = await window.xiao.publish.preflight(session.siteDir, force);
    if (!result.ok) {
      checks.value = [
        { key: 'build', ok: false, label: '站点能构建', detail: result.message, more: '', slug: '', action: '' },
      ];
      return;
    }
    checks.value = result.data.items;
    checkedAt.value = result.data.checkedAt;
  } finally {
    checking.value = false;
  }
}

async function applyTargetUrl(): Promise<void> {
  if (!session.siteDir || !target.value?.siteUrl) {
    notify('先在发布目标里填站点网址。', 'error', 'publish-url');
    return;
  }
  let base = '/';
  try {
    const path = new URL(target.value.siteUrl).pathname;
    base = !path || path === '/' ? '/' : path.endsWith('/') ? path : `${path}/`;
  } catch {
    notify('站点网址不是合法地址。', 'error', 'publish-url');
    return;
  }
  const result = await window.xiao.settings.patch(session.siteDir, {
    set: { 'site.url': target.value.siteUrl, 'site.base': base },
  });
  if (!result.ok) {
    notify(`没有改成目标网址：${result.message}`, 'error', 'publish-url');
    return;
  }
  notify('站点地址已改成发布目标的网址。', 'info', 'publish-url');
  await runPreflight();
}

async function saveSiteUrl(): Promise<void> {
  if (!session.siteDir) return;
  const result = await window.xiao.publish.setSiteUrl(session.siteDir, siteUrlDraft.value.trim());
  if (!result.ok) {
    notify(result.message, 'error', 'publish-url');
    return;
  }
  target.value = { ...target.value, ...result.data };
  notify('站点网址已保存。', 'info', 'publish-url');
  await runPreflight();
}

async function loadAll(check = true): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir) {
    changes.value = emptyChanges();
    checks.value = [];
    history.value = [];
    historyPersisted.value = true;
    target.value = null;
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const [changesResult, historyResult, targetResult] = await Promise.all([
      window.xiao.publish.changes(siteDir),
      window.xiao.publish.history(siteDir),
      window.xiao.publish.target(siteDir),
    ]);
    changes.value = changesResult.ok ? changesResult.data : emptyChanges();
    history.value = historyResult.ok ? historyResult.data.rows : [];
    historyPersisted.value = historyResult.ok ? historyResult.data.persisted : true;
    target.value = targetResult.ok ? targetResult.data : null;
    const listed = await window.xiao.content.list(siteDir);
    sitePostCount.value = listed.ok ? listed.data.length : changes.value.posts.length;
    await publish.hydrate(siteDir);
    const currentJob = publish.jobOf(siteDir);
    if (currentJob) applyJob(currentJob);
    if (target.value) {
      const verified = await window.xiao.publish.verify(siteDir);
      tokenReport.value = verified.ok ? verified.data : null;
      if (!siteUrlDraft.value && target.value.siteUrl) siteUrlDraft.value = target.value.siteUrl;
      if (check && !currentJob) await runPreflight();
    } else {
      checks.value = [];
    }
  } catch (error) {
    errorText.value = `读取发布信息失败：${error instanceof Error ? error.message : String(error)}。点「刷新」重试。`;
  } finally {
    loading.value = false;
  }
}

async function openSite(): Promise<void> {
  const result = await window.xiao.project.open();
  if (!result.ok) {
    notify(`打开站点失败：${result.message}`, 'error', 'publish-site');
    return;
  }
  if (!result.data) return;
  session.setSite(result.data.dir, result.data.title);
  session.setNav('publish');
}

onMounted(() => {
  void loadAll();
});

watch(
  () => publish.jobOf(session.siteDir),
  (job) => {
    const wasRunning = phase.value === 'running';
    applyJob(job);
    if (wasRunning && job?.status === 'ok' && target.value?.remoteEmpty) {
      target.value = { ...target.value, remoteEmpty: false };
    }
    if (wasRunning && job && job.status !== 'running' && session.siteDir) {
      void refreshChanges();
      void window.xiao.publish.history(session.siteDir).then((historyResult) => {
        if (!historyResult.ok) return;
        history.value = historyResult.data.rows;
        historyPersisted.value = historyResult.data.persisted;
      });
    }
  },
);

watch(
  () => session.siteDir,
  () => {
    phase.value = 'ready';
    steps.value = [];
    prep.value = blankPrep();
    heldTarget.value = null;
    repoQuery.value = '';
    void loadAll();
  },
);

</script>

<template>
  <section class="publish">
    <div v-if="!session.siteDir" class="center">
      <UiEmpty
        title="还没打开站点"
        description="发布要读这个站点的改动和设置。先打开一个站点。"
        :icon="icons.publish"
      >
        <template #action>
          <UiButton variant="primary" @click="openSite">打开站点</UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="loading && !target && changes.posts.length === 0" class="center">
      <UiSpinner :size="20" />
      <p class="dim">正在读取站点和发布目标…</p>
    </div>

    <template v-else>
      <header class="head">
        <h1>发布</h1>
      </header>

      <p v-if="errorText" class="alert">{{ errorText }}</p>

      <div v-if="target?.provider === 'gitea'" class="frame">
        <section class="panel card">
          <h2>Gitea 已不再作为发布目标，请连接 GitHub 仓库</h2>
          <div class="prep-actions">
            <UiButton variant="primary" @click="reconnectGithub">重新连接</UiButton>
          </div>
        </section>
      </div>

      <div v-else-if="!target" class="frame">
        <section class="panel card">
          <h2>发布准备</h2>
          <ol class="prep-steps">
            <li v-for="step in shownPrep" :key="step">
              <button
                v-if="stepPhase(prep.step, step, prep.done) === 'done'"
                type="button"
                class="fold done-step"
                @click="prep = reopen(prep, step)"
              >
                <UiIcon :path="icons.ok" :size="16" />
                <span>{{ stepLine(prep, step) }}</span>
              </button>
              <p v-else-if="stepPhase(prep.step, step, prep.done) === 'later'" class="later-step">{{ stepTitle(step) }}</p>
              <div v-else class="prep-current">
                <template v-if="step === 'token'">
                  <h3>创建令牌</h3>
                  <p>仓库：只选 {{ prep.owner }}/{{ prep.repo }}。权限：Contents 读写、Workflows 读写、Pages 读写、Actions 只读。</p>
                  <div class="prep-actions">
                    <UiButton variant="primary" @click="openLink(tokenPage(prep))">在 GitHub 创建只授权这个仓库的令牌</UiButton>
                  </div>
                  <h3>粘贴并验证</h3>
                  <UiField label="访问令牌">
                    <UiInput v-model="prep.token" type="password" autocomplete="off" placeholder="粘贴刚才创建的细粒度令牌" />
                  </UiField>
                  <div class="prep-actions">
                    <UiButton variant="primary" :loading="prepBusy" @click="verifyPasted">令牌验证</UiButton>
                    <UiButton v-if="tokenCanContinue" @click="prep = acceptToken(prep)">继续</UiButton>
                  </div>
                  <p v-if="prep.report?.status === 'rejected'" class="summary">
                    账号 {{ prep.report.account || '未知' }} · {{ prep.report.kind === 'github-classic' ? '经典令牌' : '细粒度令牌' }}
                  </p>
                  <p v-else-if="prep.report?.status === 'valid'" class="summary">
                    {{ prep.report.account }} · {{ tokenKindLabel(prep.report.kind) }} · {{ tokenExpiryText(prep.report.expiresAt) }}
                  </p>
                  <p v-else-if="prep.report" class="summary">{{ prep.report.message }}</p>
                  <ul v-if="prep.report?.status === 'valid'" class="cap-list">
                    <li v-for="item in prep.report.capabilities" :key="item.key">
                      <UiIcon :path="capIcon(item.state)" :size="16" />
                      <span>{{ item.label }}</span>
                      <span class="dim">{{ capabilityText(item.state) }}</span>
                    </li>
                  </ul>
                </template>
                <template v-else-if="step === 'repo'">
                  <h3>仓库</h3>
                  <p class="dim">填 owner/repo 或仓库网址。空的公开仓库可以直接用。</p>
                  <template v-if="repoChosen">
                    <div class="repo-card">
                      <p>{{ prep.owner }}/{{ prep.repo }}</p>
                      <p class="dim">分支 {{ prep.branch }}</p>
                      <button type="button" class="fold" @click="clearRepoPick">换一个</button>
                    </div>
                    <p v-if="foreignWarn" class="alert">{{ prep.error }}</p>
                    <div v-if="foreignWarn" class="prep-actions">
                      <UiButton variant="primary" @click="confirmForeign">确认继续</UiButton>
                    </div>
                  </template>
                  <template v-else>
                    <UiField label="仓库">
                      <UiInput v-model="repoQuery" placeholder="owner/repo，或 https://github.com/owner/repo" />
                    </UiField>
                    <div class="prep-actions">
                      <UiButton variant="primary" :loading="prepBusy" @click="useTypedRepo">检查仓库</UiButton>
                      <UiButton variant="ghost" :loading="prepBusy" @click="useTypedRepo">我已建好，重新检查</UiButton>
                      <UiButton variant="ghost" @click="openLink(newRepoPage(prep, repoQuery.split('/').pop() || ''))">去网页新建仓库</UiButton>
                    </div>
                    <div v-if="prep.error.includes('没找到') && prep.owner" class="prep-actions">
                      <UiButton @click="continueMissing">先继续</UiButton>
                    </div>
                  </template>
                </template>
                <template v-else-if="step === 'site'">
                  <h3>网站地址</h3>
                  <p class="summary">{{ suggestedSite.siteUrl }}</p>
                  <p class="dim">路径 {{ suggestedSite.base }}</p>
                  <div class="prep-actions">
                    <UiButton variant="primary" @click="acceptSite">写入并继续</UiButton>
                  </div>
                </template>
                <template v-else-if="step === 'build'">
                  <h3>构建准备</h3>
                  <p class="dim">能自动做的会直接做。做不到的给你链接。</p>
                  <div class="publish-row">
                    <UiButton variant="primary" :loading="prepBusy" @click="runPrepare">
                      {{ prep.manualLink || prep.error ? '我已完成，重新检查' : '开始准备' }}
                    </UiButton>
                    <UiButton v-if="prep.manualLink" variant="ghost" @click="openLink(prep.manualLink)">打开网页</UiButton>
                  </div>
                </template>
                <template v-else-if="step === 'publish'">
                  <h3>首次发布</h3>
                  <p>仓库和构建都准备好了。接下来是检查、推送、远端构建、上线。</p>
                  <div class="prep-actions">
                    <UiButton variant="primary" :loading="pushing" @click="startFirstPublish">开始首次发布</UiButton>
                  </div>
                </template>
                <p v-if="prep.error && !foreignWarn" class="alert">{{ prep.error }}</p>
                <p v-if="prep.next" class="dim">{{ prep.next }}</p>
              </div>
            </li>
          </ol>
        </section>
        <aside class="side">
          <section class="card">
            <h2>{{ prepHelp[prep.step].title }}</h2>
            <p>{{ prepHelp[prep.step].body }}</p>
          </section>
        </aside>
      </div>

      <div v-else class="frame">
        <section class="panel card">
          <div class="target-line" :class="{ warn: tokenBlocked }">
            <UiIcon :path="target?.provider === 'github' ? icons.github : icons.repo" :size="18" />
            <p>
              发布到 GitHub · {{ repoName(target?.remoteUrl ?? '') }}（{{ target?.branch }}）→
              <button v-if="target?.siteUrl" type="button" class="link" @click="openPublishedSite">{{ target?.siteUrl }}</button>
              <span v-else class="dim">还没有网址</span>
            </p>
            <span class="token-status">{{ tokenStatusText }}</span>
            <UiButton v-if="tokenBlocked" size="sm" variant="primary" @click="reconnectOpen = true">重新连接</UiButton>
          </div>
          <template v-if="phase === 'ready'">
            <h2>将发布什么</h2>
            <p class="summary">{{ summaryLine }}</p>
            <ul v-if="previewPosts.length" class="titles">
              <li v-for="post in previewPosts" :key="post.slug">{{ post.title }}</li>
            </ul>
            <button v-if="fileLines.length" type="button" class="fold" @click="filesOpen = !filesOpen">
              {{ filesOpen ? '收起明细' : '明细' }}
            </button>
            <ul v-if="filesOpen && fileLines.length" class="files">
              <li v-for="line in fileLines" :key="line.key" :class="{ deleted: line.deleted }">{{ line.text }}</li>
            </ul>

            <div class="check-head">
              <h2>检查</h2>
              <UiButton size="sm" variant="ghost" :disabled="checking" @click="runPreflight(true)">重新检查</UiButton>
            </div>
            <p v-if="checking" class="dim">正在构建并检查…</p>
            <p v-else-if="checksClear" class="pass-line">
              <UiIcon :path="icons.ok" :size="16" class="good" />
              <span>检查通过 {{ checks.length }} 项</span>
              <span v-if="checkedLabel" class="dim">{{ checkedLabel }}</span>
            </p>
            <template v-else>
              <ul class="checks">
                <li v-for="item in failedChecks" :key="item.key">
                  <UiIcon :path="icons.alert" :size="16" class="bad" />
                  <div>
                    <p>{{ item.label }}</p>
                    <p class="dim">{{ item.detail }}</p>
                    <button
                      v-if="item.more"
                      type="button"
                      class="more-link"
                      :class="{ open: moreKey === item.key }"
                      @click="moreKey = moreKey === item.key ? '' : item.key"
                    >
                      <UiIcon :path="icons.chevronRight" :size="14" />
                      详细信息
                    </button>
                    <pre v-if="item.more && moreKey === item.key" class="log">{{ item.more }}</pre>
                  </div>
                  <UiButton v-if="item.action === 'open-post' && item.slug" size="sm" variant="ghost" @click="openArticle(item.slug)">
                    打开这篇文章
                  </UiButton>
                  <UiButton v-else-if="item.action === 'seo'" size="sm" variant="ghost" @click="go('seo')">去 SEO</UiButton>
                  <UiButton v-else-if="item.action === 'settings'" size="sm" variant="ghost" @click="go('settings')">去设置</UiButton>
                  <UiButton v-else-if="item.action === 'apply-url'" size="sm" variant="ghost" @click="applyTargetUrl">
                    一键改成目标网址
                  </UiButton>
                </li>
              </ul>
              <p v-if="passedCount" class="dim">其余 {{ passedCount }} 项通过</p>
              <ul v-if="skippedChecks.length" class="checks skipped">
                <li v-for="item in skippedChecks" :key="item.key">
                  <UiIcon :path="icons.more" :size="16" />
                  <div>
                    <p>{{ item.label }}</p>
                    <p class="dim">未进行</p>
                  </div>
                </li>
              </ul>
            </template>
            <div class="publish-row">
              <p v-if="tokenBlocked" class="dim">{{ tokenReport?.message || '令牌已失效' }}</p>
              <p v-else-if="blockReason" class="dim">{{ blockReason }}</p>
              <UiButton
                v-if="!tokenBlocked"
                variant="primary"
                :icon-left="icons.publish"
                :disabled="blocked || checking"
                @click="startPublish(false)"
              >
                发布
              </UiButton>
            </div>
          </template>

          <template v-else>
            <h2>{{ liveOk ? '已上线' : steps.some((step) => step.state === 'fail') ? '发布停住了' : '发布进度' }}</h2>
            <ol class="rail">
              <li v-for="(step, index) in steps" :key="step.key" :class="step.state">
                <span v-if="index > 0" class="join" :class="{ done: steps[index - 1]?.state === 'ok' }" />
                <span class="node">
                  <UiSpinner v-if="step.state === 'run'" :size="16" />
                  <UiIcon v-else :path="stepIcon(step)" :size="18" />
                </span>
                <span class="caption">
                  {{ step.label }}
                  <template v-if="step.state === 'ok' || step.state === 'fail' || step.state === 'run'">
                    {{ (stepMs(step) / 1000).toFixed(1) }} 秒
                  </template>
                </span>
              </li>
            </ol>
            <p v-if="liveOk && (target?.siteUrl || publish.jobOf(session.siteDir)?.siteUrl)" class="site-url">
              <button type="button" class="link" @click="openPublishedSite">
                {{ target?.siteUrl || publish.jobOf(session.siteDir)?.siteUrl }}
              </button>
            </p>
            <p v-else-if="failureView.reason" class="summary">{{ failureView.reason }}</p>
            <p v-else class="dim">
              {{ steps.find((step) => step.state === 'run')?.detail }}
              <template v-if="target?.provider === 'github' && steps.some((step) => step.key === 'build' && step.state === 'run')">
                GitHub Pages 首次部署可能要 1～2 分钟。
              </template>
            </p>
            <pre v-if="failureView.log" class="log">{{ failureView.log }}</pre>
            <div v-if="liveOk" class="publish-row">
              <UiButton variant="primary" @click="openPublishedSite">打开网站</UiButton>
              <UiButton @click="finishPublish">完成</UiButton>
            </div>
            <div v-else-if="phase === 'result'" class="publish-row">
              <template v-if="needsForce">
                <UiButton size="sm" variant="danger" @click="forceOpen = true">覆盖并推送</UiButton>
                <UiButton size="sm" variant="ghost" @click="dismissJob">返回</UiButton>
              </template>
              <template v-else-if="buildFailed">
                <UiButton v-if="steps.find((step) => step.key === 'build')?.url" size="sm" variant="ghost" @click="openBuildLog">
                  在 GitHub 查看
                </UiButton>
                <UiButton size="sm" variant="ghost" @click="dismissJob">返回</UiButton>
              </template>
              <template v-else>
                <UiButton size="sm" :disabled="checking" @click="startPublish(false)">重试</UiButton>
                <UiButton v-for="entry in resultEntries" :key="entry.key" size="sm" variant="ghost" @click="entry.run">
                  {{ entry.label }}
                </UiButton>
                <UiButton size="sm" variant="ghost" @click="dismissJob">返回</UiButton>
              </template>
            </div>
          </template>
        </section>

        <aside class="side">
          <section class="card">
            <div class="card-head">
              <h2>发布目标</h2>
              <UiButton size="sm" variant="ghost" @click="settingsOpen = true">设置</UiButton>
            </div>
            <p class="summary">{{ repoName(target?.remoteUrl ?? '') }}</p>
            <p class="dim">分支 {{ target?.branch }}</p>
            <p class="dim">令牌账号 {{ tokenReport?.account || '—' }}</p>
            <p class="dim">{{ pagesLabel }}</p>
            <p v-if="target?.actionsDetail && !tokenBlocked" class="dim">{{ target.actionsDetail }}</p>
            <button
              v-if="target?.siteUrl"
              type="button"
              class="link url-clip"
              :title="target?.siteUrl"
              @click="openPublishedSite"
            >
              {{ target?.siteUrl }}
            </button>
            <p><UiBadge :tone="runnerBadge.tone" dot>{{ runnerBadge.text }}</UiBadge></p>
          </section>
          <section class="card">
            <h2>最近发布</h2>
            <p v-if="!historyPersisted" class="dim">本机无法保存，重启后清空</p>
            <p v-if="!historyRows.length" class="dim">还没有发布记录。</p>
            <ul v-else class="recent">
              <li v-for="item in shownHistory" :key="item.at" :title="historyStepDetail(item.steps) || undefined">
                <UiIcon :path="historyConclusion(item) === '已上线' ? icons.ok : icons.alert" :size="14" />
                <span>{{ historyConclusion(item) }}</span>
                <span class="dim">{{ relativeTime(item.at) }}</span>
                <span class="dim">{{ item.sha ? item.sha.slice(0, 7) : '' }}</span>
              </li>
            </ul>
            <button v-if="historyRows.length > 5" type="button" class="fold" @click="historyAll = !historyAll">
              {{ historyAll ? '收起' : '全部' }}
            </button>
          </section>
        </aside>
      </div>

      <UiDialog v-model="reconnectOpen" title="重新连接" :width="440">
        <p>粘贴新的访问令牌。令牌验证通过后才会换掉本机保存的旧令牌。</p>
        <UiField label="访问令牌">
          <UiInput v-model="reconnectToken" type="password" autocomplete="off" placeholder="粘贴令牌" />
        </UiField>
        <template #actions>
          <UiButton variant="ghost" @click="reconnectOpen = false">取消</UiButton>
          <UiButton variant="primary" :loading="reconnecting" @click="submitReconnect">令牌验证</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model="settingsOpen" title="发布设置" :width="440">
        <p class="summary">{{ repoName(target?.remoteUrl ?? '') }}</p>
        <p class="dim dialog-meta">分支 {{ target?.branch }}。令牌只存在本机。</p>
        <UiField label="站点网址">
          <UiInput v-model="siteUrlDraft" placeholder="https://blog.example.com" />
        </UiField>
        <template #actions="{ close }">
          <div class="dialog-actions">
            <UiButton
              variant="ghost"
              style="color: var(--ui-danger); background: transparent"
              @click="
                close();
                disconnectOpen = true;
              "
            >
              断开连接
            </UiButton>
            <span class="dialog-actions__end">
              <UiButton variant="ghost" @click="close">关闭</UiButton>
              <UiButton
                variant="primary"
                @click="
                  close();
                  void saveSiteUrl();
                "
              >
                保存网址
              </UiButton>
            </span>
          </div>
        </template>
      </UiDialog>

      <UiDialog v-model="forceOpen" title="覆盖远端内容？" :width="440">
        <p>推送被远端的新提交挡住了。覆盖会用本站内容重写远端分支 {{ target?.branch }}，远端上其他提交会丢失。</p>
        <template #actions="{ close }">
          <UiButton variant="ghost" @click="close">取消</UiButton>
          <UiButton
            variant="danger"
            :loading="pushing"
            @click="
              close();
              startPublish(true);
            "
          >
            覆盖并推送
          </UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model="repairOpen" title="需要修复 git 历史" :width="480">
        <p>这个站点的 git 历史里混进了 .git 条目，现在的推送库拒绝读取。</p>
        <p>可以重建 git 历史。站点文件不会被改动，旧的 .git 会备份后留在原地。</p>
        <template #actions="{ close }">
          <UiButton variant="ghost" @click="close">先不修</UiButton>
          <UiButton variant="primary" :loading="pushing" @click="confirmRepair">重建并推送</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model="disconnectOpen" title="断开连接" :width="420">
        <p>将断开当前站点的发布连接，并删除本机保存的仓库地址与令牌。站点文件和远端仓库不受影响。</p>
        <template #actions="{ close }">
          <UiButton variant="ghost" @click="close">取消</UiButton>
          <UiButton variant="danger" @click="confirmDisconnect">断开连接</UiButton>
        </template>
      </UiDialog>
    </template>
  </section>
</template>

<style scoped>
.publish {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
  width: min(1120px, 100%);
  max-width: 100%;
  margin-inline: auto;
}

.frame {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--ui-s4);
  align-items: start;
}

.panel {
  min-width: 0;
}

.side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
  min-width: 0;
}

.prep-steps {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.platform-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-s2);
}

.platform-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.platform-card.on {
  border-color: var(--ui-accent);
}

.platform-card strong {
  font-weight: 400;
}

.platform-card span {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.later-step {
  margin: 0;
  color: var(--ui-text-3);
}

.repo-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  max-height: 240px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.repo-list li {
  display: flex;
  align-items: center;
  gap: var(--ui-s3);
}

.repo-card {
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
}

.repo-card p {
  margin: 0;
}

.mark {
  margin-left: var(--ui-s2);
}

.cap-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cap-list li {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--ui-s2);
}

.prep-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--ui-s2);
}

.done-step {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s2);
}

.prep-current {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
  width: 100%;
}

.prep-current h3,
.prep-current p {
  margin: 0;
}

.prep-current h3 {
  font-size: var(--ui-fs-3);
  font-weight: 400;
}

.target-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-s2);
  margin-bottom: var(--ui-s3);
}

.target-line p {
  margin: 0;
  min-width: 0;
}

.target-line.warn {
  color: var(--ui-danger);
}

.token-status {
  margin-left: auto;
}

.titles,
.recent {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rail {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.rail li {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 0;
  text-align: center;
}

.rail .join {
  position: absolute;
  top: 9px;
  right: 50%;
  left: -50%;
  height: 2px;
  background: var(--ui-line);
}

.rail .join.done {
  background: var(--ui-ok);
}

.rail .node {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--ui-panel);
}

.rail .caption {
  font-size: var(--ui-fs-2);
  font-weight: 400;
  color: var(--ui-text-2);
}

.rail .ok {
  color: var(--ui-ok);
}

.rail .fail {
  color: var(--ui-danger);
}

.rail .run {
  color: var(--ui-warn);
}

.files {
  max-height: 240px;
  overflow: auto;
}

.log {
  max-height: 280px;
  overflow: auto;
  margin: 0;
  padding: var(--ui-s2);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-bg);
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: var(--ui-fs-2);
}

.publish-row,
.check-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-s2);
}

.check-head {
  justify-content: space-between;
}

.pass-line {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  margin: 0;
  font-weight: 400;
}

.skipped {
  color: var(--ui-text-3);
}

.link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-accent);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.url-clip {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
}

.card-head h2 {
  margin: 0;
}

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  width: 100%;
}

.dialog-actions__end {
  display: inline-flex;
  gap: var(--ui-s2);
}

.recent li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-s2);
  font-size: var(--ui-fs-2);
}

@media (max-width: 1100px) {
  .frame {
    grid-template-columns: 1fr;
  }
}

.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s8) var(--ui-s4);
  text-align: center;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s3);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: var(--ui-s2);
}

.head-main {
  display: flex;
  align-items: baseline;
  gap: var(--ui-s3);
  min-width: 0;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

h2 {
  font-size: var(--ui-fs-4);
  font-weight: 600;
}

.dim {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.alert {
  margin: 0;
  padding: var(--ui-s3);
  border: 1px solid var(--ui-danger);
  border-radius: var(--ui-r);
  background: var(--ui-danger-weak);
  color: var(--ui-danger);
  font-size: var(--ui-fs-2);
}

.card,
.block,
.drawer {
  padding: var(--ui-s4);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
}

.block,
.card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.summary {
  font-size: var(--ui-fs-3);
}

.more-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-accent);
  font: inherit;
  cursor: pointer;
}

.more-link :deep(svg) {
  transition: transform var(--ui-dur) var(--ui-ease);
}

.more-link.open :deep(svg) {
  transform: rotate(90deg);
}

.fold {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-2);
  font: inherit;
  font-size: var(--ui-fs-2);
  cursor: pointer;
}

.files,
.checks,
.steps {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.files li,
.checks li,
.steps li {
  font-size: var(--ui-fs-2);
}

.files .deleted {
  color: var(--ui-text-3);
  text-decoration: line-through;
}

.checks li,
.steps li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s2);
  align-items: flex-start;
}

.checks li div,
.steps li p {
  flex: 1;
  min-width: 12rem;
}

.good {
  color: var(--ui-ok);
}

.bad {
  color: var(--ui-danger);
}

.step-label {
  font-weight: 600;
}

.step-detail {
  white-space: pre-wrap;
}

.site-url {
  margin: 0;
  font-size: var(--ui-fs-3);
  word-break: break-all;
}

.more {
  flex-basis: 100%;
  margin: 0;
}

.more summary {
  cursor: pointer;
  color: var(--ui-text-2);
}

.more pre {
  margin: var(--ui-s2) 0 0;
  white-space: pre-wrap;
  font: inherit;
  color: var(--ui-text-2);
}

.steps .ok .step-state {
  color: var(--ui-ok);
}

.steps .fail .step-state {
  color: var(--ui-danger);
}

.steps .run .step-state {
  color: var(--ui-warn);
}

.drawer summary {
  font-weight: 600;
  cursor: pointer;
}

.history {
  width: 100%;
  margin-top: var(--ui-s3);
  border-collapse: collapse;
  font-size: var(--ui-fs-2);
}

.history th,
.history td {
  padding: 6px 0;
  border-bottom: 1px solid var(--ui-line);
  text-align: left;
}

.next {
  margin-top: var(--ui-s2);
}
.dialog-meta {
  margin-bottom: var(--ui-s3);
}
</style>
