<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { copy } from '../copy.ts';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
  UiEmpty,
  UiField,
  UiIcon,
  UiInput,
  UiRow,
  UiSpinner,
} from '../ui/index.ts';

interface RecentSite {
  dir: string;
  title: string;
  openedAt: string;
}

const router = useRouter();
const session = useSession();

const parent = ref('');
const title = ref('');
const author = ref('');

const picking = ref(false);
const creating = ref(false);
const opening = ref(false);
const openingDir = ref('');
const errorText = ref('');
const openError = ref('');
const versionText = ref('开发版');

const recent = ref<RecentSite[]>([]);
const recentLoading = ref(false);
const recentError = ref('');

/** 新建时的阶段文案：主进程实际依次做这些事（见 main/project.ts createSite）。 */
const steps = ['复制模板', '安装依赖', '初始化 git', '启动预览'] as const;
const stepIndex = ref(0);
let stepTimers: number[] = [];

const titleInput = ref<{ focus: () => void } | null>(null);

function stopSteps(): void {
  for (const timer of stepTimers) window.clearTimeout(timer);
  stepTimers = [];
}

/**
 * 主进程新建是一次性的 IPC，没有阶段进度事件；这里按经验时间推进阶段，
 * 只作「正在做什么」的提示，界面文案里也明确说明了是估算。
 */
function startSteps(): void {
  stopSteps();
  stepIndex.value = 0;
  stepTimers = [
    window.setTimeout(() => {
      stepIndex.value = 1;
    }, 1200),
    window.setTimeout(() => {
      stepIndex.value = 2;
    }, 45000),
    window.setTimeout(() => {
      stepIndex.value = 3;
    }, 52000),
  ];
}

function explainCreateError(message: string): string {
  if (message.includes('已经存在')) {
    return `新建失败：同名文件夹已经存在。换一个站点名称，或先处理掉那个文件夹再试。`;
  }
  if (message.includes('模板')) {
    return `新建失败：找不到内置的站点模板。安装包可能不完整，建议重新安装晓。`;
  }
  if (message.includes('依赖')) {
    return `新建失败：依赖没有安装成功。检查网络和磁盘空间后重试；离线包缺失时可以先用「打开文件夹」进入已装好的站点。`;
  }
  return `新建失败：${message}。可以换一个父目录或站点名称再试。`;
}

function explainOpenError(message: string): string {
  if (message.includes('不是晓的站点')) {
    return `打开失败：这个文件夹里没有 xiao.config.json，不是晓的站点。换一个文件夹，或用「新建站点」。`;
  }
  return `打开失败：${message}。确认文件夹还在、并且有读取权限后重试。`;
}

function relativeTime(iso: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diff = Date.now() - time;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 172_800_000) return '昨天';
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const date = new Date(time);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function loadVersion(): Promise<void> {
  const result = await window.xiao.app.getInfo();
  if (result.ok) {
    versionText.value = `v${result.data.version}${result.data.packaged ? '' : ' · 开发版'}`;
  }
}

async function loadRecent(): Promise<void> {
  if (recentLoading.value) return;
  recentLoading.value = true;
  recentError.value = '';
  const result = await window.xiao.project.recent();
  recentLoading.value = false;
  if (!result.ok) {
    recentError.value = `读取最近项目失败：${result.message}。点「重试」再看一次。`;
    return;
  }
  recent.value = result.data;
}

async function pickParent(): Promise<void> {
  if (picking.value || creating.value) return;
  errorText.value = '';
  picking.value = true;
  const result = await window.xiao.project.pick();
  picking.value = false;
  if (!result.ok) {
    errorText.value = `选择目录失败：${result.message}。再点一次「选择目录」试试。`;
    return;
  }
  if (result.data) parent.value = result.data;
}

async function submit(): Promise<void> {
  if (creating.value) return;
  errorText.value = '';
  if (!parent.value) {
    errorText.value = '还没选父目录：点「选择目录」，挑一个用来放站点的文件夹。';
    return;
  }
  if (!title.value.trim()) {
    errorText.value = '站点名称还没填：站点会按这个名字建文件夹，填一个简短的名字。';
    titleInput.value?.focus();
    return;
  }
  creating.value = true;
  startSteps();
  const result = await window.xiao.project.create(
    parent.value,
    title.value.trim(),
    author.value.trim(),
  );
  stopSteps();
  creating.value = false;
  if (!result.ok) {
    errorText.value = explainCreateError(result.message);
    return;
  }
  notify(`站点「${result.data.title}」已建好，正在进入`, 'info', 'welcome-create');
  session.setSite(result.data.dir, result.data.title);
  await router.push('/studio');
}

async function enter(dir: string, siteTitle: string): Promise<void> {
  session.setSite(dir, siteTitle);
  await router.push('/studio');
}

async function openFolder(): Promise<void> {
  if (opening.value || creating.value) return;
  errorText.value = '';
  openError.value = '';
  opening.value = true;
  const result = await window.xiao.project.open();
  opening.value = false;
  if (!result.ok) {
    openError.value = explainOpenError(result.message);
    return;
  }
  if (!result.data) return;
  await enter(result.data.dir, result.data.title);
}

async function openRecent(item: RecentSite): Promise<void> {
  if (opening.value || creating.value) return;
  opening.value = true;
  openingDir.value = item.dir;
  openError.value = '';
  recentError.value = '';
  const result = await window.xiao.project.open(item.dir);
  opening.value = false;
  openingDir.value = '';
  if (!result.ok) {
    recentError.value = explainOpenError(result.message);
    return;
  }
  if (!result.data) return;
  await enter(result.data.dir, result.data.title);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (!errorText.value && !openError.value && !recentError.value) return;
  errorText.value = '';
  openError.value = '';
  recentError.value = '';
}

onMounted(() => {
  void loadVersion();
  void loadRecent();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  stopSteps();
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <main class="welcome">
    <aside class="brand">
      <div class="brand-head">
        <span class="logo" aria-hidden="true">{{ copy.appName }}</span>
        <span class="brand-name">晓<span class="brand-sub">Studio</span></span>
      </div>
      <div class="brand-copy">
        <h1>写作、外观、发布，<br />都在这一个窗口里。</h1>
        <p>
          {{ copy.welcomeLead }}本地优先，所有文件都在你自己的电脑上，成果是一个标准的 Astro
          站点。
        </p>
      </div>
      <div class="brand-foot">
        <span class="version">{{ versionText }}</span>
        <span class="foot-note">离线可用 · 发布到 Gitea / GitHub</span>
      </div>
    </aside>

    <section class="content">
      <header class="content-head">
        <h2>开始</h2>
        <p>新建一个站点，或接着最近的项目写。</p>
      </header>

      <div class="cards">
        <form class="card card-new" @submit.prevent="submit">
          <header class="card-head">
            <h3>新建站点</h3>
            <UiBadge tone="accent" dot>推荐</UiBadge>
          </header>
          <p class="card-lead">从内置模板建一个标准 Astro 站点，依赖走离线包安装。</p>

          <UiField label="父目录" hint="站点会建在这个文件夹下，站点名称会成为子文件夹名。">
            <div class="dir-row">
              <UiInput
                class="dir-input"
                :model-value="parent"
                readonly
                placeholder="还没选择文件夹"
                :icon="icons.files"
                :disabled="creating"
              />
              <UiButton
                :icon-left="icons.files"
                :loading="picking"
                :disabled="creating"
                @click="pickParent"
              >
                选择目录
              </UiButton>
            </div>
          </UiField>

          <div class="field-row">
            <UiField label="站点名称" required>
              <UiInput
                ref="titleInput"
                v-model="title"
                :disabled="creating"
                placeholder="例如：我的笔记"
                @keydown.enter.prevent="submit"
              />
            </UiField>
            <UiField label="作者" hint="留空时署名「晓」。">
              <UiInput v-model="author" :disabled="creating" placeholder="可留空" />
            </UiField>
          </div>

          <div v-if="errorText" class="alert" role="alert">
            <span class="alert-icon"><UiIcon :path="icons.alert" :size="16" /></span>
            <span class="alert-text">{{ errorText }}</span>
          </div>

          <div v-if="creating" class="steps" aria-live="polite">
            <div class="steps-head">
              <UiSpinner :size="14" />
              <span>正在新建站点…</span>
            </div>
            <ol class="step-list">
              <li
                v-for="(step, index) in steps"
                :key="step"
                class="step"
                :class="{ 'is-done': index < stepIndex, 'is-active': index === stepIndex }"
              >
                <span class="step-mark">
                  <UiIcon v-if="index < stepIndex" :path="icons.check" :size="12" />
                  <UiSpinner v-else-if="index === stepIndex" :size="12" />
                  <span v-else class="step-dot" />
                </span>
                <span>{{ step }}</span>
              </li>
            </ol>
            <p class="steps-note">
              阶段按经验估算，不是精确进度；安装依赖通常最久，完成后会自动进入编辑界面。
            </p>
          </div>

          <div class="card-foot">
            <UiButton
              type="submit"
              variant="primary"
              :icon-left="icons.plus"
              :loading="creating"
              :disabled="picking"
            >
              {{ creating ? '正在新建…' : '新建站点' }}
            </UiButton>
            <span class="foot-hint">按 Enter 也能提交</span>
          </div>
        </form>

        <div class="card card-open">
          <header class="card-head">
            <h3>打开文件夹</h3>
          </header>
          <p class="card-lead">打开一个已有的晓站点，会同时启动本地预览。</p>
          <div class="open-body">
            <UiIcon :path="icons.repo" :size="28" />
            <span>选择包含 xiao.config.json 的站点文件夹</span>
          </div>
          <div v-if="openError" class="alert" role="alert">
            <span class="alert-icon"><UiIcon :path="icons.alert" :size="16" /></span>
            <span class="alert-text">{{ openError }}</span>
          </div>
          <div class="card-foot">
            <UiButton
              :icon-left="icons.files"
              :loading="opening && !openingDir"
              :disabled="creating"
              @click="openFolder"
            >
              打开文件夹
            </UiButton>
          </div>
        </div>

        <div class="card card-migrate is-disabled" aria-disabled="true">
          <header class="card-head">
            <h3>从别处迁移</h3>
            <UiBadge tone="neutral">下一步支持</UiBadge>
          </header>
          <p class="card-lead">把已有博客搬进晓：Hexo、Valaxy、XiaoBlog 1.x。</p>
          <p class="card-hint">
            迁移器已经在核心包里写好了，界面还没接通；这一步先不假装可用，下一步支持。
          </p>
          <div class="card-foot">
            <UiButton :icon-left="icons.upload" disabled>迁移站点</UiButton>
          </div>
        </div>
      </div>

      <section class="recent">
        <header class="recent-head">
          <h3>最近打开</h3>
          <UiButton
            variant="ghost"
            size="sm"
            :icon="icons.refresh"
            aria-label="刷新最近项目"
            :disabled="recentLoading"
            @click="loadRecent"
          />
        </header>

        <div v-if="recentLoading" class="recent-state">
          <UiSpinner :size="14" />
          <span>正在读取最近项目…</span>
        </div>
        <div v-else-if="recentError" class="recent-state recent-error" role="alert">
          <span class="alert-icon"><UiIcon :path="icons.alert" :size="16" /></span>
          <span class="recent-error-text">{{ recentError }}</span>
          <UiButton variant="ghost" size="sm" @click="loadRecent">重试</UiButton>
        </div>
        <UiEmpty
          v-else-if="recent.length === 0"
          title="还没有最近项目"
          description="新建一个站点、或打开已有文件夹，之后会出现在这里。"
          :icon="icons.history"
        >
          <template #action>
            <UiButton :icon-left="icons.files" :disabled="creating" @click="openFolder">
              打开文件夹
            </UiButton>
          </template>
        </UiEmpty>
        <ul v-else class="recent-list">
          <li v-for="item in recent" :key="item.dir">
            <UiRow class="recent-row" @click="openRecent(item)">
              <template #icon>
                <UiIcon :path="icons.repo" :size="16" />
              </template>
              <span class="recent-main">
                <span class="recent-title">{{ item.title }}</span>
                <span class="recent-path">{{ item.dir }}</span>
              </span>
              <template #meta>
                <UiSpinner v-if="openingDir === item.dir" :size="12" />
                <span v-else>{{ relativeTime(item.openedAt) }}</span>
              </template>
            </UiRow>
          </li>
        </ul>
      </section>

      <p class="page-note">当前版本先适配 Gitea；GitHub 稍后开放。</p>
    </section>
  </main>
</template>

<style scoped>
.welcome {
  display: grid;
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
  min-height: 100vh;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.brand {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--ui-s8);
  height: 100vh;
  padding: var(--ui-s8) var(--ui-s6);
  border-right: 1px solid var(--ui-line);
  background: var(--ui-panel);
}

.brand-head {
  display: flex;
  align-items: center;
  gap: var(--ui-s3);
}

.logo {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: var(--ui-r);
  background: var(--ui-accent-weak);
  color: var(--ui-accent);
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

.brand-name {
  font-size: var(--ui-fs-4);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.brand-sub {
  margin-left: var(--ui-s1);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  font-weight: 500;
}

.brand-copy h1 {
  margin: 0 0 var(--ui-s4);
  font-size: var(--ui-fs-5);
  font-weight: 600;
  line-height: 1.35;
}

.brand-copy p {
  max-width: 30ch;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-3);
  line-height: var(--ui-lh);
}

.brand-foot {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.version {
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
}

.content {
  min-width: 0;
  padding: var(--ui-s8) var(--ui-s8) var(--ui-s7);
}

.content-head {
  display: flex;
  align-items: baseline;
  gap: var(--ui-s3);
  margin-bottom: var(--ui-s5);
}

.content-head h2 {
  font-size: var(--ui-fs-4);
  font-weight: 600;
}

.content-head p {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s4);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
  min-width: 0;
  padding: var(--ui-s5);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-lg);
  background: var(--ui-panel);
}

.card-new {
  grid-column: 1 / -1;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
}

.card-head h3 {
  margin: 0;
  font-size: var(--ui-fs-4);
  font-weight: 600;
}

.card-lead {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.card-hint {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.dir-row {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
}

.dir-input {
  flex: 1;
  min-width: 0;
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: var(--ui-s3);
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-danger-weak);
  border-radius: var(--ui-r-sm);
  background: var(--ui-danger-weak);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.alert-icon {
  display: inline-flex;
  flex: none;
  color: var(--ui-danger);
}

.alert-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
}

.steps-head {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  font-size: var(--ui-fs-2);
  font-weight: 500;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.step.is-done {
  color: var(--ui-text-2);
}

.step.is-active {
  color: var(--ui-text);
}

.step-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ui-s4);
  height: var(--ui-s4);
  color: var(--ui-text-3);
}

.step.is-done .step-mark {
  color: var(--ui-ok);
}

.step.is-active .step-mark {
  color: var(--ui-accent);
}

.step-dot {
  width: var(--ui-s1);
  height: var(--ui-s1);
  border-radius: 999px;
  background: var(--ui-line-2);
}

.steps-note {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.card-foot {
  display: flex;
  align-items: center;
  gap: var(--ui-s3);
  margin-top: auto;
}

.foot-hint {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.open-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-s2);
  min-height: 96px;
  padding: var(--ui-s5) var(--ui-s4);
  border: 1px dashed var(--ui-line-2);
  border-radius: var(--ui-r);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  text-align: center;
}

.card-migrate {
  opacity: 0.72;
}

.recent {
  margin-top: var(--ui-s6);
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-lg);
  background: var(--ui-panel);
}

.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ui-s2) var(--ui-s3) var(--ui-s2) var(--ui-s4);
  border-bottom: 1px solid var(--ui-line);
}

.recent-head h3 {
  margin: 0;
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: var(--ui-s2);
  list-style: none;
}

.recent-row {
  min-height: var(--ui-s7);
  padding-top: var(--ui-s1);
  padding-bottom: var(--ui-s1);
}

.recent-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  line-height: 1.4;
}

.recent-title {
  overflow: hidden;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.recent-path {
  overflow: hidden;
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.recent-state {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s4);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.recent-error {
  color: var(--ui-text-2);
}

.recent-error-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.page-note {
  margin-top: var(--ui-s5);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

@media (max-width: 1180px) {
  .brand {
    padding: var(--ui-s6) var(--ui-s5);
  }

  .content {
    padding: var(--ui-s6);
  }
}

@media (max-width: 1020px) {
  .welcome {
    grid-template-columns: minmax(0, 1fr);
  }

  .brand {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-s3);
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--ui-line);
  }

  .brand-copy {
    display: none;
  }

  .brand-foot {
    flex-direction: row;
    align-items: center;
    gap: var(--ui-s3);
  }
}

@media (max-width: 760px) {
  .content {
    padding: var(--ui-s5) var(--ui-s4);
  }

  .cards {
    grid-template-columns: minmax(0, 1fr);
  }

  .field-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .dir-row {
    flex-wrap: wrap;
  }

  .dir-input {
    flex-basis: 100%;
  }
}
</style>
