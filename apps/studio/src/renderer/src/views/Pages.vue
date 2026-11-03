<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { groupStudioPages, pageLabel } from '@xiao/core/site';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import {
  UiButton,
  UiEmpty,
  UiField,
  UiIcon,
  UiInput,
  UiPopover,
  UiRow,
  UiSpinner,
} from '../ui/index.ts';

type TemplateKey = 'blank' | 'docs' | 'landing' | 'magazine' | 'about';

interface TemplateOption {
  key: TemplateKey;
  label: string;
  description: string;
  icon: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const templates: TemplateOption[] = [
  {
    key: 'blank',
    label: '空白',
    description: '只有页面骨架，结构自己搭。',
    icon: icons.files,
  },
  {
    key: 'docs',
    label: '文档',
    description: '侧栏 + 正文，适合说明与手册。',
    icon: icons.layers,
  },
  {
    key: 'landing',
    label: '落地页',
    description: '首屏 + 分栏 + 卡片 + 行动号召。',
    icon: icons.pages,
  },
  {
    key: 'magazine',
    label: '杂志',
    description: '首屏 + 要目网格 + 引用。',
    icon: icons.posts,
  },
  {
    key: 'about',
    label: '关于',
    description: '介绍站点与作者，改文案即可。',
    icon: icons.help,
  },
];

const session = useSession();

const pages = ref<string[]>([]);
const loading = ref(true);
const error = ref('');
const createOpen = ref(false);
const slug = ref('');
const slugTouched = ref(false);
const creating = ref<TemplateKey | ''>('');

const slugText = computed(() => slug.value.trim().toLowerCase());
const slugValid = computed(() => SLUG_PATTERN.test(slugText.value));
const slugError = computed(() => {
  if (!slugTouched.value) return '';
  if (!slugText.value) return '先填页面地址，例如 about';
  if (!slugValid.value) return '只能用...，例如 about-us';
  return '';
});

const groupedPages = computed(() => groupStudioPages(pages.value));

function describeError(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim();
  return '未知错误';
}

/** 相对路径：列表次行（相对站点根目录）。 */
function filePath(file: string): string {
  return file.replaceAll('\\', '/');
}

async function load(): Promise<void> {
  if (!session.siteDir) {
    pages.value = [];
    error.value = '';
    loading.value = false;
    return;
  }
  if (pages.value.length === 0) loading.value = true;
  error.value = '';
  try {
    const result = await window.xiao.page.list(session.siteDir);
    if (!result.ok) {
      pages.value = [];
      error.value = `${result.message}。点重试再读一次；仍失败就确认站点文件夹还在。`;
      return;
    }
    pages.value = result.data;
  } catch (cause) {
    pages.value = [];
    error.value = `读取页面列表时出错（${describeError(cause)}）。点重试再读一次；仍失败就重新打开站点。`;
  } finally {
    loading.value = false;
  }
}

function setCreateOpen(open: boolean): void {
  createOpen.value = open;
  if (!open) return;
  slugTouched.value = false;
  slug.value = '';
}

function choose(file: string): void {
  session.setPage(file);
}

async function create(template: TemplateKey): Promise<void> {
  slugTouched.value = true;
  if (!session.siteDir) {
    notify('还没打开站点，先打开或新建站点再建页面。', 'error');
    return;
  }
  const address = slug.value.trim();
  if (!SLUG_PATTERN.test(address)) {
    notify('页面地址不合法：只用小写字母、数字和连字符，例如 about-us。', 'error');
    return;
  }
  if (creating.value) return;
  creating.value = template;
  try {
    const result = await window.xiao.page.create(session.siteDir, template, address);
    if (!result.ok) {
      notify(`没能新建页面：${result.message}。换个地址，或检查站点文件夹权限后重试。`, 'error');
      return;
    }
    createOpen.value = false;
    notify(`已新建 ${result.data}`, 'info', 'page-create');
    session.setPage(result.data);
    await load();
  } catch (cause) {
    notify(`新建页面时出错：${describeError(cause)}。确认站点文件夹可写后重试。`, 'error');
  } finally {
    creating.value = '';
  }
}

onMounted(() => {
  void load();
});

watch(
  () => session.siteDir,
  () => {
    void load();
  },
);
</script>

<template>
  <div class="pages">
    <div class="toolbar">
      <div v-if="session.siteDir" class="create-host">
        <UiPopover
          placement="bottom-start"
          :model-value="createOpen"
          @update:model-value="setCreateOpen"
        >
          <template #trigger>
            <UiButton variant="primary" size="sm" :icon-left="icons.plus" block>
              新建页面
            </UiButton>
          </template>
          <template #default>
            <div class="create-menu">
              <UiField
                label="页面地址"
                :error="slugError"
                hint="只用小写字母、数字和连字符，会变成 /地址/。"
                required
              >
                <UiInput
                  v-model="slug"
                  placeholder="例如 about"
                  autofocus
                  :invalid="!!slugError"
                  @keydown.enter="create('blank')"
                />
              </UiField>
              <p class="menu-title">选择模板</p>
              <button
                v-for="template in templates"
                :key="template.key"
                class="template"
                type="button"
                :disabled="creating !== ''"
                @click="create(template.key)"
              >
                <UiSpinner v-if="creating === template.key" :size="16" />
                <UiIcon v-else :path="template.icon" :size="18" />
                <span class="template-main">
                  <span class="template-name">{{ template.label }}</span>
                  <span class="template-desc">{{ template.description }}</span>
                </span>
              </button>
            </div>
          </template>
        </UiPopover>
      </div>
    </div>

    <div v-if="!session.siteDir" class="state">
      <UiEmpty
        :icon="icons.repo"
        title="先打开一个站点"
        description="打开或新建站点后，页面会列在这里。"
      />
    </div>

    <div v-else-if="loading" class="state">
      <UiSpinner :size="22" label="正在读取页面" />
    </div>

    <div v-else-if="error" class="state">
      <UiEmpty :icon="icons.alert" title="读取页面失败" :description="error">
        <template #action>
          <UiButton variant="default" size="sm" :icon-left="icons.refresh" @click="load">
            重试
          </UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="groupedPages.site.length === 0 && groupedPages.system.length === 0" class="state">
      <UiEmpty
        :icon="icons.pages"
        title="还没有页面"
        description="从「新建页面」开始：空白页、落地页或关于页。"
      >
        <template #action>
          <UiButton variant="primary" size="sm" :icon-left="icons.plus" @click="setCreateOpen(true)">
            新建页面
          </UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else class="list">
      <section v-if="groupedPages.site.length" class="group">
        <header class="group-head">
          <span class="group-name">站点页面</span>
          <span class="group-count">{{ groupedPages.site.length }}</span>
        </header>
        <UiRow
          v-for="file in groupedPages.site"
          :key="file"
          :selected="session.activePage === file"
          :title="filePath(file)"
          @click="choose(file)"
        >
          <template #icon>
            <UiIcon :path="icons.files" :size="16" />
          </template>
          <span class="file-name">{{ pageLabel(file) }}</span>
          <template #meta>
            <span class="file-path" :title="filePath(file)">{{ filePath(file) }}</span>
          </template>
        </UiRow>
      </section>
      <section v-if="groupedPages.system.length" class="group">
        <header class="group-head">
          <span class="group-name">系统容器</span>
          <span class="group-count">{{ groupedPages.system.length }}</span>
        </header>
        <p class="group-hint">站点外壳和范式页：改这里会影响很多文章，不是改某一篇正文。</p>
        <UiRow
          v-for="file in groupedPages.system"
          :key="file"
          :selected="session.activePage === file"
          :title="filePath(file)"
          @click="choose(file)"
        >
          <template #icon>
            <UiIcon :path="icons.pages" :size="16" />
          </template>
          <span class="file-name">{{ pageLabel(file) }}</span>
          <template #meta>
            <span class="file-path" :title="filePath(file)">{{ filePath(file) }}</span>
          </template>
        </UiRow>
      </section>
      <p class="total">
        共 {{ groupedPages.site.length + groupedPages.system.length }} 项
      </p>
    </div>
  </div>
</template>

<style scoped>
.pages {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  height: 100%;
  min-height: 0;
}

.toolbar {
  display: flex;
  flex: none;
}

.create-host {
  display: block;
  width: 100%;
}

.create-host :deep(.ui-popover__trigger) {
  width: 100%;
}

.state {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ui-s3);
  min-height: 0;
  overflow: auto;
  padding-right: var(--ui-s1);
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  padding: var(--ui-s1) var(--ui-s2);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.group-count {
  font-weight: 400;
}

.group-hint {
  margin: 0 0 var(--ui-s2);
  padding: 0 var(--ui-s2);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path {
  max-width: 128px;
  overflow: hidden;
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.total {
  margin: 0;
  padding: var(--ui-s1) var(--ui-s2) var(--ui-s3);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  text-align: center;
}

.create-menu {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  padding: var(--ui-s1);
}

.menu-title {
  margin: var(--ui-s1) 0 0;
  padding: 0 var(--ui-s1);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.template {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  width: 100%;
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  text-align: left;
  cursor: pointer;
  transition:
    background-color var(--ui-dur) var(--ui-ease),
    border-color var(--ui-dur) var(--ui-ease),
    color var(--ui-dur) var(--ui-ease);
}

.template:hover:not(:disabled) {
  border-color: var(--ui-line-2);
  background: var(--ui-hover);
  color: var(--ui-text);
}

.template:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.template:disabled {
  opacity: 0.6;
  cursor: progress;
}

.template-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.template-name {
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 500;
  line-height: var(--ui-lh);
}

.template-desc {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}
</style>
