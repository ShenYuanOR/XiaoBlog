<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import repoGuide from '../../../../resources/guides/01-repo.svg';
import tokenGuide from '../../../../resources/guides/02-token.svg';
import pagesGuide from '../../../../resources/guides/03-pages.svg';
import { renewalDue } from '../../../../src/main/release-gate.ts';
import { guides, pagesSettingsUrl, parseRepo, tokenUrl } from '../../../../src/main/wizard.ts';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
  UiDialog,
  UiEmpty,
  UiField,
  UiIcon,
  UiInput,
  UiPanel,
  UiSpinner,
} from '../ui/index.ts';

interface ChangeGroups {
  posts: string[];
  pages: string[];
  settings: string[];
}

interface ChangeRow {
  path: string;
  area: '文章' | '页面' | '设置';
  deleted: boolean;
}

interface SeoRow {
  level: string;
  rule: string;
  detail: string;
}

interface DeployRecord {
  at: string;
  repo: string;
}

interface TokenRow {
  repo: string;
  expires: string;
}

interface DeployTarget {
  provider: 'gitea' | 'github';
  remoteUrl: string;
  branch: string;
  login?: string;
  persisted?: boolean;
}

interface PushResult {
  committed: boolean;
  forced: boolean;
  warnings: string[];
  message: string;
  remote: string;
  branch: string;
}

type Guide = (typeof guides)[number];
type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

const session = useSession();

const guideImages: Record<string, string> = {
  repo: repoGuide,
  token: tokenGuide,
  pages: pagesGuide,
};

const loading = ref(false);
const errorText = ref('');
const changes = ref<ChangeGroups>({ posts: [], pages: [], settings: [] });
const filesKnown = ref(false);
const diskFiles = ref<Set<string>>(new Set());
const seoRows = ref<SeoRow[]>([]);
const seoFailed = ref(false);
const history = ref<DeployRecord[]>([]);
const tokens = ref<TokenRow[]>([]);
const target = ref<DeployTarget | null>(null);

const giteaUrl = ref('');
const giteaLogin = ref('');
const giteaToken = ref('');
const connecting = ref(false);
const pushing = ref(false);
const pushError = ref('');
const pushResult = ref<PushResult | null>(null);
const forceOpen = ref(false);
const disconnectOpen = ref(false);
const repairOpen = ref(false);

const repoLink = ref('');
const branch = ref('master');
const token = ref('');
const tokenExpires = ref('');
const savingToken = ref(false);
const writing = ref(false);
const checkingRepo = ref(false);
const removingRepo = ref('');
const removeOpen = ref(false);

const parsed = computed(() => parseRepo(repoLink.value));

const repoError = computed(() =>
  repoLink.value.trim() && !parsed.value
    ? '格式不对：用 https://github.com/owner/repo、git@github.com:owner/repo.git 或 owner/repo'
    : '',
);

/** git 状态位没有经 IPC 返回，这里只能按「磁盘上还在不在」区分删除与其它改动。 */
const changeRows = computed<ChangeRow[]>(() => {
  const result: ChangeRow[] = [];
  const push = (paths: string[], area: ChangeRow['area']): void => {
    for (const path of paths) {
      const normalized = path.replaceAll('\\', '/');
      result.push({
        path: normalized,
        area,
        deleted: filesKnown.value && !diskFiles.value.has(normalized),
      });
    }
  };
  push(changes.value.posts, '文章');
  push(changes.value.pages, '页面');
  push(changes.value.settings, '设置');
  return result;
});

const editedRows = computed(() => changeRows.value.filter((row) => !row.deleted));
const deletedRows = computed(() => changeRows.value.filter((row) => row.deleted));

const seoErrors = computed(() => seoRows.value.filter((row) => row.level === 'error'));

const blocked = computed(() => seoFailed.value || seoErrors.value.length > 0);

const canPush = computed(() => Boolean(session.siteDir) && Boolean(target.value) && !blocked.value);

const pushLabel = computed(() => {
  if (blocked.value) return '修复 SEO 错误后才能推送';
  if (!target.value) return '先连接 Gitea 仓库';
  return pushing.value ? '推送中…' : '推送到 Gitea';
});

const gateReasons = computed<string[]>(() => {
  const reasons: string[] = [];
  if (seoFailed.value) {
    reasons.push('SEO 检查没跑成功，无法确认能不能推送；先到「SEO」页点「重新检查」。');
  }
  for (const row of seoErrors.value.slice(0, 5)) {
    reasons.push(`${row.rule}：${row.detail}`);
  }
  if (seoErrors.value.length > 5) {
    reasons.push(`还有 ${seoErrors.value.length - 5} 条 error，到「SEO」页查看完整清单。`);
  }
  return reasons;
});

const gateItems = computed<
  { key: string; label: string; ok: boolean; text: string; tone: BadgeTone }[]
>(() => [
  {
    key: 'seo',
    label: 'SEO 体检',
    ok: !seoFailed.value && seoErrors.value.length === 0,
    text: seoFailed.value
      ? '检查失败'
      : seoErrors.value.length > 0
        ? `${seoErrors.value.length} 个 error，会挡住推送`
        : '0 个 error，通过',
    tone: seoFailed.value || seoErrors.value.length > 0 ? 'danger' : 'ok',
  },
  {
    key: 'target',
    label: 'Gitea 仓库',
    ok: Boolean(target.value),
    text: target.value ? `已连接 · ${target.value.branch}` : '还没连接',
    tone: target.value ? 'ok' : 'neutral',
  },
  {
    key: 'changes',
    label: '待推送改动',
    ok: changeRows.value.length > 0,
    text: changeRows.value.length > 0 ? `${changeRows.value.length} 个文件` : '没有改动',
    tone: changeRows.value.length > 0 ? 'accent' : 'neutral',
  },
]);

const needsForce = computed(() => /覆盖远端|快进|non-fast-forward|force/i.test(pushError.value));

const manualTokens = computed(() => tokens.value.filter((item) => !looksLikePath(item.repo)));

const historyRows = computed(() => [...history.value].slice(-20).reverse());

const renewing = computed(() =>
  tokens.value.filter((item) => item.expires && renewalDue(item.expires, new Date())),
);

function looksLikePath(key: string): boolean {
  return key.includes('\\') || key.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(key);
}

function imageOf(guide: Guide): string {
  return guideImages[guide.id] ?? '';
}

function primaryHref(guide: Guide): string {
  if (guide.id === 'pages') {
    const repo = parsed.value;
    return repo ? pagesSettingsUrl(repo.owner, repo.repo) : '';
  }
  return guide.href;
}

function formatTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleString('zh-CN', { hour12: false });
}

function expiringSoon(expires: string): boolean {
  return expires ? renewalDue(expires, new Date()) : false;
}

function isPushRecord(repo: string): boolean {
  return /^https?:\/\//i.test(repo);
}

function aheadOfTime(): void {
  notify(
    'GitHub Pages 推送按规划排在 Gitea 之后；现在只能写本地配置和 workflow 文件。',
    'info',
    'publish-next',
  );
}

async function connectGitea(): Promise<void> {
  if (!session.siteDir) {
    notify('先打开站点，才能连接仓库。', 'error', 'publish-connect');
    return;
  }
  const url = giteaUrl.value.trim().replace(/\/$/, '');
  if (!url) {
    notify('先填 Gitea 仓库地址，例如 http://192.168.1.10:3000/owner/site.git', 'error', 'publish-connect');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    notify('仓库地址要以 http:// 或 https:// 开头。', 'error', 'publish-connect');
    return;
  }
  if (!giteaLogin.value.trim()) {
    notify('先填 Gitea 用户名（登录名或邮箱）；Gitea 不接受空用户名。', 'error', 'publish-connect');
    return;
  }
  if (!giteaToken.value.trim()) {
    notify('先填访问令牌；它会加密保存在本机，不会写进站点文件。', 'error', 'publish-connect');
    return;
  }
  connecting.value = true;
  try {
    const result = await window.xiao.publish.connect(
      session.siteDir,
      'gitea',
      url,
      giteaLogin.value.trim(),
      giteaToken.value.trim(),
    );
    if (!result.ok) {
      notify(`连接失败：${result.message}`, 'error', 'publish-connect');
      return;
    }
    target.value = result.data;
    giteaToken.value = '';
    pushError.value = '';
    notify(
      `已连接 ${result.data.remoteUrl}（分支 ${result.data.branch}）。确认改动与门禁后点「推送」。`,
      'info',
      'publish-connect',
    );
    if (result.data.persisted === false) {
      notify(
        '令牌和仓库信息无法写入本机用户目录（可能被安全软件拦截，例如火绒 HIPS），只在本次运行有效；下次启动需要重新连接。',
        'error',
        'publish-persist',
      );
    }
    await loadTokens();
  } catch (error) {
    notify(
      `连接失败：${error instanceof Error ? error.message : String(error)}。检查地址、令牌和网络后重试。`,
      'error',
      'publish-connect',
    );
  } finally {
    connecting.value = false;
  }
}

async function push(force: boolean): Promise<void> {
  if (!session.siteDir || !target.value) {
    notify('还没有连接 Gitea 仓库，先在下方卡片里填地址和令牌。', 'error', 'publish-push');
    return;
  }
  if (blocked.value) {
    notify(gateReasons.value[0] ?? 'SEO 体检有错误，先修复再推送。', 'error', 'publish-push');
    return;
  }
  pushing.value = true;
  pushError.value = '';
  try {
    const result = await window.xiao.publish.push(session.siteDir, force);
    if (!result.ok) {
      pushError.value = result.message;
      notify(result.message, 'error', 'publish-push');
      if (result.code === 'REPO_BROKEN') {
        repairOpen.value = true;
      }
      return;
    }
    pushResult.value = result.data;
    const action = result.data.committed ? '已提交并推送' : '没有新提交，已推送现有提交';
    notify(`${action}：${result.data.remote}（${result.data.branch}）。`, 'info', 'publish-push');
    await window.xiao.publish.record(session.siteDir, result.data.remote);
    await loadAll();
  } catch (error) {
    pushError.value = `推送失败：${
      error instanceof Error ? error.message : String(error)
    }。检查远端连接后重试。`;
    notify(pushError.value, 'error', 'publish-push');
  } finally {
    pushing.value = false;
  }
}

async function confirmRepair(): Promise<void> {
  repairOpen.value = false;
  if (!session.siteDir) return;
  const fixed = await window.xiao.publish.repair(session.siteDir);
  if (!fixed.ok) {
    notify(`修复失败：${fixed.message}`, 'error', 'publish-repair');
    return;
  }
  notify(
    `git 历史已重建：${fixed.data.files} 个文件；旧的 .git 备份在 ${fixed.data.backup}。继续推送…`,
    'info',
    'publish-repair',
  );
  await push(false);
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
  giteaLogin.value = '';
  pushResult.value = null;
  pushError.value = '';
  notify('已断开远端连接，并删除这个站点在本机保存的令牌。', 'info', 'publish-connect');
  await loadTokens();
}

async function copyLink(url: string, label: string): Promise<void> {
  if (!url) {
    notify('这一步没有现成链接：先在上面填好仓库链接，或按文字说明手动操作。', 'info', 'publish-copy');
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    notify(`${label}已复制，请在浏览器里打开。`, 'info', 'publish-copy');
  } catch {
    notify(`复制失败，请手动打开：${url}`, 'error', 'publish-copy');
  }
}

async function loadTokens(): Promise<void> {
  const result = await window.xiao.secret.list();
  if (result.ok) {
    tokens.value = result.data;
    return;
  }
  tokens.value = [];
  notify(`读不到已保存的令牌：${result.message}`, 'error', 'publish-token-list');
}

async function saveToken(): Promise<void> {
  const repo = parsed.value;
  if (!repo) {
    notify('先填正确的仓库链接，例如 owner/repo。', 'error', 'publish-token');
    return;
  }
  if (!token.value.trim()) {
    notify('先粘贴访问令牌；它只会加密保存在本机，不会写进站点文件。', 'error', 'publish-token');
    return;
  }
  savingToken.value = true;
  const result = await window.xiao.secret.save(
    `${repo.owner}/${repo.repo}`,
    token.value.trim(),
    tokenExpires.value,
  );
  savingToken.value = false;
  if (!result.ok) {
    notify(`令牌保存失败：${result.message}。确认这台电脑能使用系统加密存储。`, 'error', 'publish-token');
    return;
  }
  token.value = '';
  notify('令牌已加密保存到本机，不会写进站点文件。', 'info', 'publish-token');
  await loadTokens();
}

function askRemove(repo: string): void {
  removingRepo.value = repo;
  removeOpen.value = true;
}

async function confirmRemove(): Promise<void> {
  const repo = removingRepo.value;
  removeOpen.value = false;
  if (!repo) return;
  const result = await window.xiao.secret.remove(repo);
  if (!result.ok) {
    notify(`删除令牌失败：${result.message}`, 'error', 'publish-token');
    return;
  }
  notify(`已删除 ${repo} 的本机令牌。`, 'info', 'publish-token');
  await loadTokens();
}

async function writeLocal(): Promise<void> {
  const repo = parsed.value;
  if (!session.siteDir) {
    notify('先打开站点，才能写部署配置。', 'error', 'publish-config');
    return;
  }
  if (!repo) {
    notify('先填正确的仓库链接，例如 owner/repo。', 'error', 'publish-config');
    return;
  }
  writing.value = true;
  const result = await window.xiao.wizard.write(
    session.siteDir,
    repo.owner,
    repo.repo,
    branch.value.trim() || 'master',
  );
  writing.value = false;
  if (!result.ok) {
    notify(`写本地配置失败：${result.message}。确认站点目录可写。`, 'error', 'publish-config');
    return;
  }
  await window.xiao.publish.record(session.siteDir, `${repo.owner}/${repo.repo}`);
  notify(
    '已写好 xiao.config.json 与 .github/workflows/deploy.yml（GitHub Pages 格式），并记入部署历史；没有推送。',
    'info',
    'publish-config',
  );
  await loadAll();
}

async function checkGitHub(): Promise<void> {
  const repo = parsed.value;
  if (!repo) {
    notify('先填 GitHub 仓库链接，例如 owner/repo。', 'error', 'publish-github');
    return;
  }
  checkingRepo.value = true;
  const result = await window.xiao.github.repo(repo.owner, repo.repo);
  checkingRepo.value = false;
  if (!result.ok) {
    notify(
      `仓库检查失败：${result.message}。先保存该仓库的访问令牌，并确认网络或代理可用。`,
      'error',
      'publish-github',
    );
    return;
  }
  notify(
    `GitHub 能访问 ${repo.owner}/${repo.repo}（HTTP ${result.data.status}）；Pages 是否开启仍需到网页端确认。`,
    'info',
    'publish-github',
  );
}

async function loadFiles(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir) return;
  const files = await window.xiao.dev.files(siteDir);
  if (files.ok) {
    filesKnown.value = true;
    diskFiles.value = new Set(files.data.map((path) => path.replaceAll('\\', '/')));
    return;
  }
  filesKnown.value = false;
  diskFiles.value = new Set();
}

async function loadAll(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir) {
    changes.value = { posts: [], pages: [], settings: [] };
    seoRows.value = [];
    seoFailed.value = false;
    history.value = [];
    filesKnown.value = false;
    diskFiles.value = new Set();
    target.value = null;
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const [changesResult, seoResult, historyResult, configResult, targetResult] =
      await Promise.all([
        window.xiao.publish.changes(siteDir),
        window.xiao.seo.check(siteDir),
        window.xiao.publish.history(siteDir),
        window.xiao.settings.read(siteDir),
        window.xiao.publish.target(siteDir),
      ]);

    changes.value = changesResult.ok
      ? changesResult.data
      : { posts: [], pages: [], settings: [] };

    if (seoResult.ok) {
      seoRows.value = seoResult.data;
      seoFailed.value = false;
    } else {
      seoRows.value = [];
      seoFailed.value = true;
      errorText.value = `SEO 检查失败：${seoResult.message}。先到「SEO」页重试，再回来发布。`;
    }

    history.value = historyResult.ok ? historyResult.data : [];
    target.value = targetResult.ok ? targetResult.data : null;
    if (target.value) {
      if (!giteaUrl.value) giteaUrl.value = target.value.remoteUrl;
      if (!giteaLogin.value && target.value.login) giteaLogin.value = target.value.login;
    }

    if (configResult.ok) {
      const deploy = configResult.data['deploy'];
      if (deploy && typeof deploy === 'object') {
        const record = deploy as Record<string, unknown>;
        const repo = record['repo'];
        const configBranch = record['branch'];
        if (typeof repo === 'string' && repo && !repoLink.value) repoLink.value = repo;
        if (typeof configBranch === 'string' && configBranch) branch.value = configBranch;
      }
    }

    await loadFiles();
    await loadTokens();
  } catch (error) {
    errorText.value = `读取发布信息失败：${
      error instanceof Error ? error.message : String(error)
    }。点「刷新」重试；如果一直失败，检查站点目录是否还在。`;
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
  () => session.siteDir,
  () => {
    void loadAll();
  },
);
</script>

<template>
  <section class="publish">
    <div v-if="!session.siteDir" class="center">
      <UiEmpty
        title="还没打开站点"
        description="发布页要读站点的改动、体检和历史。先新建或打开一个站点，再回到这里。"
        :icon="icons.publish"
      >
        <template #action>
          <UiButton variant="primary" @click="openSite">打开站点</UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="loading" class="center">
      <UiSpinner :size="20" />
      <p class="note">正在读取改动、体检、远端连接和部署历史…</p>
    </div>

    <template v-else>
      <header class="head">
        <div class="head-text">
          <h1>发布</h1>
          <p class="note">
            Gitea 推送已接通：连接仓库、看清门禁和改动后可以提交并推送。GitHub Pages
            仍是规划中，只能写本地配置。
          </p>
        </div>
        <UiButton size="sm" :icon="icons.refresh" @click="loadAll">刷新</UiButton>
      </header>

      <p v-if="errorText" class="error-banner">
        <UiIcon :path="icons.alert" :size="16" />
        <span>{{ errorText }}</span>
      </p>

      <p v-if="renewing.length" class="warn-banner">
        <UiIcon :path="icons.shield" :size="16" />
        <span>
          {{ renewing.map((item) => item.repo).join('、') }} 的令牌将在 7 天内到期，记得续期。
        </span>
      </p>

      <div class="grid-2">
        <UiPanel title="改动清单">
          <template #actions>
            <UiBadge :tone="changeRows.length > 0 ? 'accent' : 'neutral'" dot>
              {{ changeRows.length }} 项
            </UiBadge>
          </template>

          <UiEmpty
            v-if="changeRows.length === 0"
            title="没有改动"
            description="改文章、页面或设置后，这里会列出待推送的文件；当前没有可发布内容。"
            :icon="icons.ok"
          />

          <div v-else class="change-groups">
            <section class="change-group">
              <header class="group-head">
                <h3>新增</h3>
                <UiBadge tone="neutral">—</UiBadge>
              </header>
              <p class="group-note">
                当前 publish:changes 只返回文件路径，不返回 git 状态位，新增暂时无法与修改区分；
                接通后会在主进程补上。
              </p>
            </section>

            <section class="change-group">
              <header class="group-head">
                <h3>修改</h3>
                <UiBadge tone="accent">{{ editedRows.length }}</UiBadge>
              </header>
              <p v-if="!editedRows.length" class="group-note">没有已存在的文件被修改。</p>
              <ul v-else class="change-list">
                <li v-for="row in editedRows" :key="row.path">
                  <UiBadge tone="neutral">{{ row.area }}</UiBadge>
                  <span class="change-path" :title="row.path">{{ row.path }}</span>
                </li>
              </ul>
            </section>

            <section class="change-group">
              <header class="group-head">
                <h3>删除</h3>
                <UiBadge :tone="deletedRows.length > 0 ? 'danger' : 'neutral'">
                  {{ deletedRows.length }}
                </UiBadge>
              </header>
              <p v-if="!filesKnown" class="group-note">
                读不到站点文件列表，暂时无法判断哪些改动是删除。
              </p>
              <p v-else-if="!deletedRows.length" class="group-note">没有删除的文件。</p>
              <ul v-else class="change-list">
                <li v-for="row in deletedRows" :key="row.path">
                  <UiBadge tone="danger">{{ row.area }}</UiBadge>
                  <span class="change-path is-deleted" :title="row.path">{{ row.path }}</span>
                </li>
              </ul>
            </section>
          </div>
        </UiPanel>

        <UiPanel title="发布门禁">
          <template #actions>
            <UiBadge :tone="blocked ? 'danger' : canPush ? 'ok' : 'neutral'" dot>
              {{ blocked ? '未通过' : canPush ? '可以推送' : '未连接' }}
            </UiBadge>
          </template>

          <ul class="gate-list">
            <li v-for="item in gateItems" :key="item.key" class="gate-item">
              <UiIcon
                :path="item.ok ? icons.ok : icons.alert"
                :size="16"
                :class="item.ok ? 'gate-ok' : 'gate-bad'"
              />
              <span class="gate-label">{{ item.label }}</span>
              <UiBadge :tone="item.tone">{{ item.text }}</UiBadge>
            </li>
          </ul>

          <div class="gate-actions">
            <UiButton
              variant="primary"
              :icon="icons.upload"
              :disabled="!canPush"
              :loading="pushing"
              @click="push(false)"
            >
              {{ pushLabel }}
            </UiButton>
            <p class="gate-note">
              点「推送」会先提交本站改动，再推到已连接的 Gitea；不会创建仓库，也不会改 Pages 设置。
            </p>
          </div>

          <div v-if="gateReasons.length" class="reasons">
            <p class="reasons-title">为什么不能推送：</p>
            <ul>
              <li v-for="(reason, index) in gateReasons" :key="index">{{ reason }}</li>
            </ul>
            <UiButton size="sm" variant="ghost" @click="session.setNav('seo')">
              去 SEO 页处理
            </UiButton>
          </div>

          <div v-if="pushError" class="push-error">
            <p class="push-error-text">{{ pushError }}</p>
            <div class="push-error-actions">
              <UiButton size="sm" :loading="pushing" @click="push(false)">重试</UiButton>
              <UiButton v-if="needsForce" size="sm" variant="danger" @click="forceOpen = true">
                覆盖远端并发
              </UiButton>
            </div>
          </div>

          <div v-if="pushResult" class="push-result">
            <p class="push-result-title">
              <UiBadge tone="ok" dot>推送完成</UiBadge>
              <span>
                {{ pushResult.committed ? '已提交并推送' : '没有新提交，已推送现有提交' }}
              </span>
            </p>
            <p class="note">
              {{ pushResult.message }} · {{ pushResult.remote }}（{{ pushResult.branch }}）
              <template v-if="pushResult.forced"> · 强制覆盖</template>
            </p>
            <ul v-if="pushResult.warnings.length" class="push-warnings">
              <li v-for="warning in pushResult.warnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>
        </UiPanel>
      </div>

      <section class="deploy-grid">
        <article class="deploy-card">
          <header class="deploy-head">
            <div class="deploy-name">
              <UiIcon :path="icons.repo" :size="18" />
              <h2>Gitea</h2>
            </div>
            <UiBadge :tone="target ? 'ok' : 'accent'">
              {{ target ? '已接通' : '待连接' }}
            </UiBadge>
          </header>

          <template v-if="target">
            <p class="deploy-connected">
              已连接 <code>{{ target.remoteUrl }}</code> · 分支 {{ target.branch }}
            </p>
            <p class="deploy-lead">
              推送会提交本站改动并推到上面的仓库；令牌已加密保存在本机，可随时断开。
            </p>
            <div class="deploy-actions">
              <UiButton size="sm" variant="danger" @click="disconnectOpen = true">断开连接</UiButton>
            </div>
          </template>

          <template v-else>
            <p class="deploy-lead">局域网自建 Gitea：先连接仓库，再在门禁区点「推送」。</p>
            <div class="deploy-fields">
              <UiField label="仓库地址" hint="以 http:// 或 https:// 开头，带 owner/repo">
                <UiInput v-model="giteaUrl" placeholder="http://192.168.1.10:3000/owner/site.git" />
              </UiField>
              <UiField label="用户名" hint="Gitea 登录名或邮箱（不是显示名）">
                <UiInput v-model="giteaLogin" placeholder="登录名或邮箱" autocomplete="off" />
              </UiField>
              <UiField label="访问令牌" hint="只加密保存在本机，不会写进站点文件">
                <UiInput
                  v-model="giteaToken"
                  type="password"
                  autocomplete="off"
                  placeholder="粘贴 Gitea 令牌"
                />
              </UiField>
            </div>
            <h3 class="deploy-subtitle">需要准备</h3>
            <ul class="deploy-items">
              <li>
                <UiIcon :path="icons.check" :size="14" />
                <span>Gitea 里已建好仓库（空仓库或已有提交都可以）</span>
              </li>
              <li>
                <UiIcon :path="icons.check" :size="14" />
                <span>令牌有该仓库的读写权限（Gitea 设置 → 应用 → 生成令牌）</span>
              </li>
              <li>
                <UiIcon :path="icons.check" :size="14" />
                <span>这台电脑能访问 Gitea 地址（局域网或代理）</span>
              </li>
            </ul>
            <div class="deploy-actions">
              <UiButton variant="primary" :icon="icons.shield" :loading="connecting" @click="connectGitea">
                连接仓库
              </UiButton>
            </div>
          </template>

          <p class="deploy-foot">
            连接会先用令牌探测仓库，不上传文件；只有点「推送」才会提交并推送。
          </p>
        </article>

        <article class="deploy-card">
          <header class="deploy-head">
            <div class="deploy-name">
              <UiIcon :path="icons.repo" :size="18" />
              <h2>GitHub Pages</h2>
            </div>
            <UiBadge tone="neutral">规划中</UiBadge>
          </header>
          <p class="deploy-lead">排在 Gitea 之后；现在只能写本地配置与 workflow 文件。</p>
          <h3 class="deploy-subtitle">需要准备</h3>
          <ul class="deploy-items">
            <li>
              <UiIcon :path="icons.check" :size="14" />
              <span>仓库地址（https://github.com/owner/repo）</span>
            </li>
            <li>
              <UiIcon :path="icons.check" :size="14" />
              <span>细粒度令牌（contents / workflows 写，actions 读）</span>
            </li>
            <li>
              <UiIcon :path="icons.check" :size="14" />
              <span>仓库 Settings → Pages 的 Source 选 GitHub Actions</span>
            </li>
          </ul>
          <div class="deploy-actions">
            <UiButton :icon="icons.shield" @click="aheadOfTime">下一步接通</UiButton>
            <UiButton
              size="sm"
              variant="ghost"
              :loading="checkingRepo"
              @click="checkGitHub"
            >
              验证令牌与仓库访问
            </UiButton>
          </div>
          <p class="deploy-foot">
            当前只会写 xiao.config.json 和 workflow 文件，不会创建仓库、开启 Pages 或推送代码。
          </p>
        </article>
      </section>

      <UiPanel title="GitHub Pages 本地配置（旧流程，只写文件）" collapsible :default-open="false">
        <p class="note panel-note">
          仓库链接只用来生成 <code>xiao.config.json</code> 里的地址与
          <code>.github/workflows/deploy.yml</code>；这一步不会推送。
        </p>

        <div class="form-grid">
          <UiField label="仓库链接" :error="repoError" hint="支持 https、ssh 或 owner/repo">
            <UiInput v-model="repoLink" placeholder="https://github.com/owner/repo" />
          </UiField>
          <UiField label="分支" hint="推送目标分支，默认 master">
            <UiInput v-model="branch" placeholder="master" />
          </UiField>
        </div>

        <div class="form-grid">
          <UiField label="访问令牌" hint="只在本机加密保存，不会写进站点文件">
            <UiInput v-model="token" type="password" autocomplete="off" placeholder="粘贴令牌" />
          </UiField>
          <UiField label="令牌到期日" hint="可不填；填了会在到期前 7 天提醒">
            <UiInput v-model="tokenExpires" type="date" />
          </UiField>
        </div>

        <div class="config-actions">
          <UiButton
            :icon="icons.shield"
            :disabled="!parsed || !token.trim()"
            :loading="savingToken"
            @click="saveToken"
          >
            加密保存令牌
          </UiButton>
          <UiButton
            variant="primary"
            :icon="icons.save"
            :disabled="!parsed"
            :loading="writing"
            @click="writeLocal"
          >
            写入本地配置与 workflow
          </UiButton>
          <UiButton
            size="sm"
            variant="ghost"
            :icon="icons.external"
            @click="copyLink(tokenUrl, '令牌创建链接')"
          >
            复制令牌创建链接
          </UiButton>
        </div>

        <div class="tokens">
          <h3 class="tokens-title">已保存的 GitHub 令牌</h3>
          <p class="note">Gitea 连接用的令牌按站点保存，不会出现在这个列表里。</p>
          <p v-if="!manualTokens.length" class="note">还没有保存任何 GitHub 令牌。</p>
          <ul v-else class="token-list">
            <li v-for="item in manualTokens" :key="item.repo" class="token-row">
              <span class="token-repo" :title="item.repo">{{ item.repo }}</span>
              <UiBadge :tone="expiringSoon(item.expires) ? 'warn' : 'neutral'">
                {{ item.expires ? `到期 ${item.expires}` : '未填到期日' }}
              </UiBadge>
              <UiButton size="sm" variant="ghost" @click="askRemove(item.repo)">删除</UiButton>
            </li>
          </ul>
        </div>
      </UiPanel>

      <UiPanel title="部署历史">
        <template #actions>
          <UiBadge tone="neutral">最多 20 条</UiBadge>
        </template>
        <UiEmpty
          v-if="!historyRows.length"
          title="还没有部署记录"
          description="推送成功或点「写入本地配置与 workflow」后，这里会记一条。"
          :icon="icons.history"
        />
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>仓库</th>
                <th>结果</th>
                <th class="col-dim">提交</th>
                <th class="col-dim">耗时</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in historyRows" :key="item.at">
                <td>{{ formatTime(item.at) }}</td>
                <td class="cell-repo" :title="item.repo">{{ item.repo }}</td>
                <td>
                  <UiBadge :tone="isPushRecord(item.repo) ? 'ok' : 'neutral'" dot>
                    {{ isPushRecord(item.repo) ? '已推送' : '本地配置' }}
                  </UiBadge>
                </td>
                <td class="col-dim">—</td>
                <td class="col-dim">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="note panel-note">
          历史目前只存时间与仓库；提交号与耗时还没写进记录，等发布记录扩展后再显示。
        </p>
      </UiPanel>

      <UiPanel title="部署引导（旧版三步）">
        <div class="steps">
          <article v-for="(guide, index) in guides" :key="guide.id" class="step">
            <header class="step-head">
              <span class="step-num">{{ index + 1 }}</span>
              <h3>{{ guide.title }}</h3>
            </header>
            <img class="step-image" :src="imageOf(guide)" :alt="guide.title" />
            <p class="step-text">{{ guide.text }}</p>
            <div class="step-actions">
              <UiButton size="sm" @click="copyLink(primaryHref(guide), '这一步的链接')">
                复制链接
              </UiButton>
              <UiButton size="sm" variant="ghost" @click="copyLink(guide.doc, '官方说明链接')">
                复制官方说明
              </UiButton>
            </div>
          </article>
        </div>
        <p class="note panel-note">
          这三步是 GitHub Pages 的旧版引导，内容保留；Gitea 的连接步骤见上方卡片。
        </p>
      </UiPanel>

      <UiDialog v-model="forceOpen" title="覆盖远端并发" :width="440">
        <p>
          推送被远端的新提交挡住了。覆盖会用本站内容重写远端分支
          <code>{{ target?.branch }}</code>，远端上不属于本站的提交会丢失。
        </p>
        <p>确认要覆盖时，点下面的「覆盖并推送」。</p>
        <template #actions="{ close }">
          <UiButton variant="ghost" @click="close">取消</UiButton>
          <UiButton
            variant="danger"
            :loading="pushing"
            @click="
              close();
              push(true);
            "
          >
            覆盖并推送
          </UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model="repairOpen" title="需要修复 git 历史" :width="480">
        <p>
          这个站点是旧版 Studio 建的，git 历史里混进了 <code>.git</code> 条目，现在的推送库拒绝读取。
        </p>
        <p>
          可以重建 git 历史：<strong>站点文件不会被改动</strong>，旧的 <code>.git</code> 会备份成
          <code>.git-broken-&lt;时间&gt;</code> 保留在原地。重建后本站的提交历史从头开始。
        </p>
        <template #actions="{ close }">
          <UiButton variant="ghost" @click="close">先不修</UiButton>
          <UiButton variant="primary" :loading="pushing" @click="confirmRepair">重建并推送</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model="disconnectOpen" title="断开 Gitea 连接" :width="420">
        <p>
          将断开当前站点的 Gitea 连接，并删除本机保存的仓库地址与令牌。站点文件和远端仓库不受影响。
        </p>
        <template #actions="{ close }">
          <UiButton variant="ghost" @click="close">取消</UiButton>
          <UiButton variant="danger" @click="confirmDisconnect">断开连接</UiButton>
        </template>
      </UiDialog>

      <UiDialog v-model="removeOpen" title="删除本机令牌" :width="420">
        <p>
          将删除
          <strong>{{ removingRepo }}</strong>
          在本机加密存储里的访问令牌。删除后需要重新粘贴才能再检查或写入，站点文件不受影响。
        </p>
        <template #actions="{ close }">
          <UiButton variant="ghost" @click="close">取消</UiButton>
          <UiButton variant="danger" @click="confirmRemove">删除令牌</UiButton>
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
  max-width: 1120px;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-s4);
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  min-width: 0;
}

.head-text h1 {
  margin: 0;
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

.note {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.panel-note {
  margin-top: var(--ui-s3);
}

code {
  padding: 1px 4px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.error-banner,
.warn-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  margin: 0;
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.error-banner {
  border-color: var(--ui-danger-weak);
  background: var(--ui-danger-weak);
  color: var(--ui-danger);
}

.warn-banner {
  border-color: var(--ui-warn-weak);
  background: var(--ui-warn-weak);
  color: var(--ui-warn);
}

.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: var(--ui-s4);
  align-items: start;
}

.change-groups {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.change-group {
  padding-top: var(--ui-s2);
  border-top: 1px solid var(--ui-line);
}

.change-group:first-child {
  padding-top: 0;
  border-top: 0;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
}

.group-head h3 {
  margin: 0;
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.group-note {
  margin: var(--ui-s1) 0 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.change-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  margin: var(--ui-s2) 0 0;
  padding: 0;
  list-style: none;
}

.change-list li {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-width: 0;
}

.change-path {
  overflow: hidden;
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-path.is-deleted {
  color: var(--ui-danger);
  text-decoration: line-through;
}

.gate-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.gate-item {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.gate-label {
  flex: 1;
  min-width: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.gate-ok {
  color: var(--ui-ok);
}

.gate-bad {
  color: var(--ui-danger);
}

.gate-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  margin-top: var(--ui-s3);
  padding-top: var(--ui-s3);
  border-top: 1px solid var(--ui-line);
}

.gate-note {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.reasons {
  margin-top: var(--ui-s3);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-danger-weak);
  border-radius: var(--ui-r);
  background: var(--ui-danger-weak);
}

.reasons-title {
  margin: 0 0 var(--ui-s1);
  color: var(--ui-danger);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.reasons ul {
  margin: 0 0 var(--ui-s2);
  padding-left: var(--ui-s4);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.push-error {
  margin-top: var(--ui-s3);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-danger-weak);
  border-radius: var(--ui-r);
  background: var(--ui-danger-weak);
}

.push-error-text {
  margin: 0;
  color: var(--ui-danger);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.push-error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s2);
  margin-top: var(--ui-s2);
}

.push-result {
  margin-top: var(--ui-s3);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
}

.push-result-title {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  margin: 0 0 var(--ui-s1);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.push-warnings {
  margin: var(--ui-s2) 0 0;
  padding-left: var(--ui-s4);
  color: var(--ui-warn);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.deploy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s4);
}

.deploy-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  padding: var(--ui-s4);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
}

.deploy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
}

.deploy-name {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  color: var(--ui-text-2);
}

.deploy-name h2 {
  margin: 0;
  color: var(--ui-text);
  font-size: var(--ui-fs-4);
  font-weight: 600;
}

.deploy-lead {
  margin: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.deploy-connected {
  margin: 0;
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  word-break: break-all;
}

.deploy-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s2);
}

.deploy-subtitle {
  margin: var(--ui-s1) 0 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.deploy-items {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.deploy-items li {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.deploy-items li svg {
  margin-top: 3px;
  color: var(--ui-accent);
}

.deploy-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s2);
  margin-top: var(--ui-s1);
}

.deploy-foot {
  margin: 0;
  padding-top: var(--ui-s2);
  border-top: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s3);
  margin-bottom: var(--ui-s3);
}

.config-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-s2);
}

.tokens {
  margin-top: var(--ui-s4);
  padding-top: var(--ui-s3);
  border-top: 1px solid var(--ui-line);
}

.tokens-title {
  margin: 0 0 var(--ui-s2);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.token-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  margin: var(--ui-s2) 0 0;
  padding: 0;
  list-style: none;
}

.token-row {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: var(--ui-h-sm);
}

.token-repo {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-wrap {
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ui-fs-2);
}

.table th {
  padding: var(--ui-s2) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.table td {
  padding: var(--ui-s2) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-text-2);
}

.table tbody tr:last-child td {
  border-bottom: 0;
}

.cell-repo {
  overflow: hidden;
  max-width: 220px;
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-dim {
  width: 80px;
  color: var(--ui-text-3);
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-s3);
}

.step {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
}

.step-head {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-s5);
  height: var(--ui-s5);
  border-radius: var(--ui-r-lg);
  background: var(--ui-accent-weak);
  color: var(--ui-accent);
  font-size: var(--ui-fs-1);
  font-weight: 600;
}

.step-head h3 {
  margin: 0;
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.step-image {
  width: 100%;
  max-height: 120px;
  object-fit: contain;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-panel);
}

.step-text {
  margin: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s1);
  margin-top: auto;
}

@media (max-width: 1180px) {
  .grid-2,
  .deploy-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .steps {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 960px) {
  .form-grid,
  .deploy-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
