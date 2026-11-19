<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
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

interface SeoRow {
  level: string;
  rule: string;
  detail: string;
}

interface DeployRecord {
  at: string;
  repo: string;
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

type StepState = 'wait' | 'run' | 'ok' | 'fail';

interface StepRow {
  key: 'check' | 'push' | 'build' | 'live';
  label: string;
  state: StepState;
  detail: string;
  ms: number;
}

const RULE_TEXT: Record<string, string> = {
  'site-url-missing': '还没填站点地址',
  'site-url-placeholder': '站点地址还是占位，不能发布',
  'slug-invalid': '文章地址不合法',
  'slug-duplicate': '文章地址重复',
  'title-too-long': '标题太长',
  'description-missing': '没写摘要',
  'description-too-short': '摘要太短',
  'description-too-long': '摘要太长',
  'title-duplicate': '标题重复',
  'og-image-missing': '没有默认分享图',
};

const session = useSession();

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
const seoRows = ref<SeoRow[]>([]);
const seoFailed = ref(false);
const history = ref<DeployRecord[]>([]);
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
const phase = ref<'ready' | 'running' | 'result'>('ready');
const steps = ref<StepRow[]>([]);
const filesOpen = ref(false);

const addedPosts = computed(() => changes.value.posts.filter((post) => post.status === 'added'));
const editedPosts = computed(() =>
  changes.value.posts.filter((post) => post.status === 'modified' || post.status === 'renamed'),
);
const deletedPosts = computed(() => changes.value.posts.filter((post) => post.status === 'deleted'));
const seoErrors = computed(() => seoRows.value.filter((row) => row.level === 'error'));
const blocked = computed(() => seoFailed.value || seoErrors.value.length > 0);
const historyRows = computed(() => [...history.value].slice(-20).reverse());
const needsForce = computed(() => /覆盖远端|快进|non-fast-forward|force/i.test(pushError.value));

const summaryLine = computed(() => {
  const parts: string[] = [];
  if (addedPosts.value.length) parts.push(`${addedPosts.value.length} 篇新文章`);
  if (editedPosts.value.length) parts.push(`修改 ${editedPosts.value.length} 篇`);
  if (deletedPosts.value.length) parts.push(`删除 ${deletedPosts.value.length} 篇`);
  if (changes.value.settings.length) parts.push('站点设置有变化');
  if (changes.value.pages.length) parts.push('页面有变化');
  if (changes.value.other.length) parts.push('还有其他文件变化');
  return parts.length ? parts.join('、') : '没有待发布的改动';
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

function reasonOf(row: SeoRow): string {
  const name = RULE_TEXT[row.rule] ?? '需要处理';
  return row.detail ? `${name}：${row.detail}` : name;
}

function formatTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleString('zh-CN', { hour12: false });
}

function isPushRecord(repo: string): boolean {
  return /^https?:\/\//i.test(repo);
}

function freshSteps(): StepRow[] {
  return [
    { key: 'check', label: '检查', state: 'wait', detail: '确认站点能发布', ms: 0 },
    { key: 'push', label: '推送', state: 'wait', detail: '提交并推到仓库', ms: 0 },
    { key: 'build', label: '远端构建', state: 'wait', detail: '等这次提交触发的构建', ms: 0 },
    { key: 'live', label: '上线', state: 'wait', detail: '打开站点，核对这次的版本号', ms: 0 },
  ];
}

function go(nav: 'seo' | 'settings'): void {
  session.setNav(nav);
}

async function connectGitea(): Promise<void> {
  if (!session.siteDir) {
    notify('先打开站点，才能连接仓库。', 'error', 'publish-connect');
    return;
  }
  const url = giteaUrl.value.trim().replace(/\/$/, '');
  if (!url) {
    notify('先填 Gitea 仓库地址。', 'error', 'publish-connect');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    notify('仓库地址要以 http:// 或 https:// 开头。', 'error', 'publish-connect');
    return;
  }
  if (!giteaLogin.value.trim()) {
    notify('先填 Gitea 用户名。Gitea 不接受空用户名。', 'error', 'publish-connect');
    return;
  }
  if (!giteaToken.value.trim()) {
    notify('先填访问令牌。它会加密保存在本机，不会写进站点文件。', 'error', 'publish-connect');
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
    phase.value = 'ready';
    notify(`已连接 ${result.data.remoteUrl}（分支 ${result.data.branch}）。`, 'info', 'publish-connect');
    if (result.data.persisted === false) {
      notify('令牌无法写入本机用户目录，只在本次运行有效。下次启动需要重新连接。', 'error', 'publish-persist');
    }
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

async function push(force: boolean): Promise<boolean> {
  if (!session.siteDir || !target.value) {
    pushError.value = '还没有连接仓库。';
    return false;
  }
  pushing.value = true;
  pushError.value = '';
  try {
    const result = await window.xiao.publish.push(session.siteDir, force);
    if (!result.ok) {
      pushError.value = result.message;
      if (result.code === 'REPO_BROKEN') repairOpen.value = true;
      return false;
    }
    pushResult.value = result.data;
    await window.xiao.publish.record(session.siteDir, result.data.remote);
    return true;
  } catch (error) {
    pushError.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    pushing.value = false;
  }
}

async function startPublish(force = false): Promise<void> {
  if (!target.value || pushing.value) return;
  phase.value = 'running';
  const next = freshSteps();
  const started = Date.now();
  if (blocked.value) {
    next[0] = {
      key: 'check',
      label: '检查',
      state: 'fail',
      detail: seoFailed.value ? '检查没有跑完' : reasonOf(seoErrors.value[0] ?? { level: 'error', rule: '', detail: '' }),
      ms: 0,
    };
    steps.value = next;
    phase.value = 'result';
    return;
  }
  next[0] = { key: 'check', label: '检查', state: 'ok', detail: '没有挡住发布的错误', ms: Date.now() - started };
  next[1] = { key: 'push', label: '推送', state: 'run', detail: '正在提交并推送', ms: 0 };
  steps.value = next;
  const pushStarted = Date.now();
  const ok = await push(force);
  const pushMs = Date.now() - pushStarted;
  if (!ok) {
    next[1] = { key: 'push', label: '推送', state: 'fail', detail: pushError.value || '推送没有完成', ms: pushMs };
    steps.value = [...next];
    phase.value = 'result';
    return;
  }
  next[1] = {
    key: 'push',
    label: '推送',
    state: 'ok',
    detail: pushResult.value?.message || '已推送',
    ms: pushMs,
  };
  next[2] = {
    key: 'build',
    label: '远端构建',
    state: 'wait',
    detail: '推送已经完成。跟踪这次提交的构建还没接上，所以这次不能算已上线。',
    ms: 0,
  };
  steps.value = [...next];
  phase.value = 'result';
  await loadAll();
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
  giteaLogin.value = '';
  pushResult.value = null;
  pushError.value = '';
  phase.value = 'ready';
  steps.value = [];
  notify('已断开远端连接，并删除这个站点在本机保存的令牌。', 'info', 'publish-connect');
}

async function loadAll(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir) {
    changes.value = emptyChanges();
    seoRows.value = [];
    seoFailed.value = false;
    history.value = [];
    target.value = null;
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const [changesResult, seoResult, historyResult, targetResult] = await Promise.all([
      window.xiao.publish.changes(siteDir),
      window.xiao.seo.check(siteDir),
      window.xiao.publish.history(siteDir),
      window.xiao.publish.target(siteDir),
    ]);
    changes.value = changesResult.ok ? changesResult.data : emptyChanges();
    if (seoResult.ok) {
      seoRows.value = seoResult.data;
      seoFailed.value = false;
    } else {
      seoRows.value = [];
      seoFailed.value = true;
      errorText.value = '发布前检查没有跑完。可以到 SEO 页再看一次。';
    }
    history.value = historyResult.ok ? historyResult.data : [];
    target.value = targetResult.ok ? targetResult.data : null;
    if (target.value) {
      if (!giteaUrl.value) giteaUrl.value = target.value.remoteUrl;
      if (!giteaLogin.value && target.value.login) giteaLogin.value = target.value.login;
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
  () => session.siteDir,
  () => {
    phase.value = 'ready';
    steps.value = [];
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
        <div class="head-main">
          <h1>发布</h1>
          <p class="dim">{{ target ? (phase === 'ready' ? '待发布' : '发布进度') : '还没选择发布目标' }}</p>
        </div>
        <UiButton size="sm" :icon-left="icons.refresh" @click="loadAll">刷新</UiButton>
      </header>

      <p v-if="errorText" class="alert">{{ errorText }}</p>

      <section v-if="!target" class="card">
        <h2>选择发布目标</h2>
        <p class="dim">先连接一个 Gitea 仓库。令牌只加密保存在本机，不会写进站点。</p>
        <div class="fields">
          <UiField label="仓库地址">
            <UiInput v-model="giteaUrl" placeholder="http://192.168.1.10:3000/owner/site.git" />
          </UiField>
          <UiField label="用户名">
            <UiInput v-model="giteaLogin" placeholder="登录名或邮箱" autocomplete="off" />
          </UiField>
          <UiField label="访问令牌">
            <UiInput v-model="giteaToken" type="password" autocomplete="off" placeholder="粘贴令牌" />
          </UiField>
        </div>
        <div class="actions">
          <UiButton variant="primary" :icon-left="icons.shield" :loading="connecting" @click="connectGitea">
            连接仓库
          </UiButton>
        </div>
        <p class="dim next">GitHub Pages：下一步支持。</p>
      </section>

      <template v-else-if="phase === 'ready'">
        <section class="block">
          <h2>将发布什么</h2>
          <p class="summary">{{ summaryLine }}</p>
          <button type="button" class="fold" @click="filesOpen = !filesOpen">
            {{ filesOpen ? '收起文件明细' : '展开文件明细' }}
          </button>
          <ul v-if="filesOpen" class="files">
            <li v-for="line in fileLines" :key="line.key" :class="{ deleted: line.deleted }">{{ line.text }}</li>
            <li v-if="!fileLines.length" class="dim">没有文件变化。</li>
          </ul>
        </section>

        <section class="block">
          <h2>发布前检查</h2>
          <ul class="checks">
            <li>
              <UiIcon :path="blocked ? icons.alert : icons.ok" :size="16" :class="blocked ? 'bad' : 'good'" />
              <div>
                <p>{{ blocked ? '还不能发布' : '可以发布' }}</p>
                <p v-if="seoFailed" class="dim">检查没有跑完。</p>
                <p v-for="row in seoErrors.slice(0, 5)" :key="`${row.rule}-${row.detail}`" class="dim">
                  {{ reasonOf(row) }}
                </p>
                <p v-if="seoErrors.length > 5" class="dim">还有 {{ seoErrors.length - 5 }} 条。</p>
              </div>
              <UiButton v-if="blocked" size="sm" variant="ghost" @click="go('seo')">去 SEO</UiButton>
            </li>
          </ul>
        </section>

        <div class="actions">
          <UiButton
            variant="primary"
            :icon-left="icons.publish"
            :disabled="blocked || pushing"
            :loading="pushing"
            @click="startPublish(false)"
          >
            发布
          </UiButton>
        </div>
      </template>

      <section v-else class="block">
        <h2>{{ steps.some((step) => step.state === 'fail') ? '发布停住了' : '发布进度' }}</h2>
        <ol class="steps">
          <li v-for="step in steps" :key="step.key" :class="step.state">
            <span class="step-label">{{ step.label }}</span>
            <span class="step-state">
              {{ step.state === 'ok' ? '完成' : step.state === 'fail' ? '失败' : step.state === 'run' ? '进行中' : '等待' }}
            </span>
            <span v-if="step.ms" class="dim">{{ (step.ms / 1000).toFixed(1) }} 秒</span>
            <p class="dim">{{ step.detail }}</p>
          </li>
        </ol>
        <div class="actions">
          <UiButton v-if="needsForce" size="sm" variant="danger" @click="forceOpen = true">覆盖并推送</UiButton>
          <UiButton v-if="steps[0]?.state === 'fail'" size="sm" variant="ghost" @click="go('seo')">去 SEO</UiButton>
          <UiButton v-if="steps[1]?.state === 'fail'" size="sm" variant="ghost" @click="go('settings')">去设置</UiButton>
          <UiButton size="sm" variant="ghost" :disabled="pushing" @click="startPublish(false)">重试</UiButton>
          <UiButton size="sm" variant="ghost" @click="phase = 'ready'">返回</UiButton>
        </div>
      </section>

      <details v-if="target" class="drawer">
        <summary>发布目标与连接</summary>
        <p v-if="target" class="dim">
          {{ target.remoteUrl }} · 分支 {{ target.branch }}。令牌只存在本机。
        </p>
        <div v-if="target" class="actions">
          <UiButton size="sm" variant="danger" @click="disconnectOpen = true">断开连接</UiButton>
        </div>
      </details>

      <details v-if="target" class="drawer">
        <summary>发布历史</summary>
        <p v-if="!historyRows.length" class="dim">还没有发布记录。</p>
        <table v-else class="history">
          <thead>
            <tr>
              <th>时间</th>
              <th>仓库</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in historyRows" :key="item.at">
              <td>{{ formatTime(item.at) }}</td>
              <td :title="item.repo">{{ item.repo }}</td>
              <td>{{ isPushRecord(item.repo) ? '已推送' : '已记录' }}</td>
            </tr>
          </tbody>
        </table>
      </details>

      <UiDialog v-model="forceOpen" title="覆盖远端并发" :width="440">
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

      <UiDialog v-model="disconnectOpen" title="断开 Gitea 连接" :width="420">
        <p>将断开当前站点的 Gitea 连接，并删除本机保存的仓库地址与令牌。站点文件和远端仓库不受影响。</p>
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
  width: min(1200px, calc(100vw - 2 * var(--ui-s6)));
  max-width: 100%;
  margin-inline: auto;
}

.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s8) var(--ui-s4);
  text-align: center;
}

.head,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s3);
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
</style>
