<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { groupStudioPages, pageLabel } from '@xiao/core/site';
import { icons } from '../icons.ts';
import { useSession } from '../stores/session.ts';
import { UiButton, UiEmpty, UiIcon, UiRow, UiSpinner } from '../ui/index.ts';

const session = useSession();

const pages = ref<string[]>([]);
const loading = ref(true);
const error = ref('');

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

function choose(file: string): void {
  session.setPage(file);
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
        description="站点页面会列在这里。要加页面，直接在源码里新建对应的 astro 文件。"
      />
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

</style>
