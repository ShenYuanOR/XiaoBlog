<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { copy } from '../copy.ts';
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
  UiPopover,
  UiRow,
  UiSegmented,
  UiSpinner,
  UiTooltip,
} from '../ui/index.ts';
import type { MediaItem } from '../../../main/media.ts';

const MEDIA_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'];
const ACCEPT = MEDIA_EXTS.map((ext) => `.${ext}`).join(',');
const VIEW_ITEMS = [
  { key: 'grid', label: '网格' },
  { key: 'list', label: '列表' },
];

const session = useSession();
const router = useRouter();

const items = ref<MediaItem[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
const filter = ref<'all' | 'unused'>('all');
const view = ref<'grid' | 'list'>('grid');
const menuPath = ref('');
const uploading = ref(false);
const dragActive = ref(false);
const broken = ref(new Set<string>());
const fileInput = ref<HTMLInputElement | null>(null);

const previewOpen = ref(false);
const previewItem = ref<MediaItem | null>(null);

const renameOpen = ref(false);
const renameItem = ref<MediaItem | null>(null);
const renameName = ref('');
const renameTouched = ref(false);
const renaming = ref(false);

const deleteOpen = ref(false);
const deleteItem = ref<MediaItem | null>(null);
const deleting = ref(false);

const filterKey = computed({
  get: () => filter.value,
  set: (value: string) => {
    filter.value = value === 'unused' ? 'unused' : 'all';
  },
});

const viewKey = computed({
  get: () => view.value,
  set: (value: string) => {
    view.value = value === 'list' ? 'list' : 'grid';
  },
});

const unusedCount = computed(() => items.value.filter((item) => !item.used).length);

const filterItems = computed(() => [
  { key: 'all', label: `全部 ${items.value.length}` },
  { key: 'unused', label: `${copy.mediaUnused} ${unusedCount.value}` },
]);

const visible = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (filter.value === 'unused' && item.used) return false;
    if (!keyword) return true;
    return (
      item.name.toLowerCase().includes(keyword) || item.path.toLowerCase().includes(keyword)
    );
  });
});

const renameError = computed(() => {
  if (!renameTouched.value) return '';
  const value = renameName.value.trim();
  if (!value) return '文件名不能为空';
  if (/[<>:"|?*\\/]/.test(value)) return '不能包含 < > : " | ? * / \\ 等字符';
  if (value.startsWith('.')) return '文件名不能以点开头';
  const dot = value.lastIndexOf('.');
  const fallback = renameItem.value?.ext ?? '';
  const ext = dot > 0 ? value.slice(dot + 1).toLowerCase() : fallback;
  if (!MEDIA_EXTS.includes(ext)) return `只支持 ${MEDIA_EXTS.join(' / ')} 图片`;
  return '';
});

function describeError(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim();
  return '未知错误';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return iso;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(
    time.getHours(),
  )}:${pad(time.getMinutes())}`;
}

/** public/ 下的图片用站内绝对引用；文章目录里的沿用相对引用。 */
function markdownRef(item: MediaItem): string {
  if (item.path.startsWith('public/')) {
    return `![](${'/'}${item.path.slice('public/'.length)})`;
  }
  const match = /^src\/content\/posts\/[^/]+\/(.+)$/.exec(item.path);
  if (match?.[1]) return `![](${'./'}${match[1]})`;
  return `![](${'/'}${item.path})`;
}

function siteRef(item: MediaItem): string {
  if (item.path.startsWith('public/')) return `/${item.path.slice('public/'.length)}`;
  return markdownRef(item).replace(/^!\[\]\((.*)\)$/, '$1');
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify(`已复制${label}：${text}`, 'info', 'media-copy');
    return;
  } catch {
    // 剪贴板 API 不可用时退回 textarea + execCommand。
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    if (!ok) throw new Error('execCommand 返回 false');
    notify(`已复制${label}：${text}`, 'info', 'media-copy');
  } catch (cause) {
    notify(`复制失败：${describeError(cause)}。手动选中路径复制也行。`, 'error', 'media-copy');
  }
}

async function load(): Promise<void> {
  if (!session.siteDir) {
    items.value = [];
    error.value = '';
    loading.value = false;
    return;
  }
  if (items.value.length === 0) loading.value = true;
  error.value = '';
  try {
    const result = await window.xiao.media.list(session.siteDir);
    if (!result.ok) {
      items.value = [];
      error.value = `${result.message}。点重试再读一次；仍失败就确认站点文件夹还在、并且能读取。`;
      return;
    }
    items.value = result.data;
  } catch (cause) {
    items.value = [];
    error.value = `读取媒体库时出错（${describeError(cause)}）。点重试再读一次；仍失败就重新打开站点。`;
  } finally {
    loading.value = false;
  }
}

function markBroken(path: string): void {
  broken.value.add(path);
}

function setMenu(path: string, open: boolean): void {
  if (open) menuPath.value = path;
  else if (menuPath.value === path) menuPath.value = '';
}

function openPreview(item: MediaItem): void {
  previewItem.value = item;
  previewOpen.value = true;
}

function copyMarkdown(item: MediaItem): void {
  void copyText(markdownRef(item), ' Markdown 引用');
}

function copyMarkdownForPreview(): void {
  if (previewItem.value) copyMarkdown(previewItem.value);
}

function copySitePath(item: MediaItem, close: () => void): void {
  close();
  void copyText(siteRef(item), '站内路径');
}

function triggerUpload(): void {
  if (!session.siteDir) {
    notify('还没打开站点，先打开或新建一个站点再上传图片。', 'error', 'media-upload');
    return;
  }
  fileInput.value?.click();
}

async function uploadFiles(files: File[]): Promise<void> {
  if (!session.siteDir) {
    notify('还没打开站点，先打开或新建一个站点再上传图片。', 'error', 'media-upload');
    return;
  }
  const imageFiles = files.filter((file) => {
    const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
    return MEDIA_EXTS.includes(ext);
  });
  if (imageFiles.length === 0) {
    notify(`没有可上传的图片：只支持 ${MEDIA_EXTS.join(' / ')}。`, 'error', 'media-upload');
    return;
  }
  uploading.value = true;
  try {
    const payload = await Promise.all(
      imageFiles.map(async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    );
    const result = await window.xiao.media.upload(session.siteDir, payload);
    if (!result.ok) {
      notify(`上传失败：${result.message}。确认站点文件夹可写后重试。`, 'error', 'media-upload');
      return;
    }
    const { uploaded, failed } = result.data;
    if (uploaded.length > 0) {
      notify(`已上传 ${uploaded.length} 张图片到 public/media`, 'info', 'media-upload');
    }
    if (failed.length > 0) {
      notify(
        `${failed.length} 张没传成功：${failed[0]?.name ?? ''}（${
          failed[0]?.reason ?? '未知原因'
        }）。检查格式和大小后重试。`,
        'error',
        'media-upload-error',
      );
    }
    await load();
  } catch (cause) {
    notify(`上传时出错：${describeError(cause)}。确认站点文件夹可写后重试。`, 'error', 'media-upload');
  } finally {
    uploading.value = false;
  }
}

function onFilesPicked(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const files = input.files ? Array.from(input.files) : [];
  input.value = '';
  if (files.length > 0) void uploadFiles(files);
}

function onDragOver(event: DragEvent): void {
  if (!session.siteDir) return;
  event.preventDefault();
  dragActive.value = true;
}

function onDragLeave(event: DragEvent): void {
  const related = event.relatedTarget;
  const current = event.currentTarget;
  if (related instanceof Node && current instanceof Node && current.contains(related)) return;
  dragActive.value = false;
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  dragActive.value = false;
  const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  if (files.length > 0) void uploadFiles(files);
}

function openRename(item: MediaItem, close: () => void): void {
  close();
  menuPath.value = '';
  renameItem.value = item;
  renameName.value = item.name;
  renameTouched.value = false;
  renameOpen.value = true;
}

async function submitRename(): Promise<void> {
  const item = renameItem.value;
  if (!item || renaming.value) return;
  renameTouched.value = true;
  if (renameError.value) return;
  if (!session.siteDir) {
    notify('还没打开站点，先打开站点再重命名图片。', 'error', 'media-rename');
    return;
  }
  renaming.value = true;
  try {
    const result = await window.xiao.media.rename(
      session.siteDir,
      item.path,
      renameName.value.trim(),
    );
    if (!result.ok) {
      notify(`没能重命名：${result.message}。换个不冲突的名字再试。`, 'error', 'media-rename');
      return;
    }
    const changed = result.data.updatedFiles;
    notify(
      changed > 0
        ? `已改名为 ${result.data.to}，更新了 ${changed} 个文件里的引用`
        : `已改名为 ${result.data.to}（没有文本引用需要更新）`,
      'info',
      'media-rename',
    );
    renameOpen.value = false;
    if (previewItem.value?.path === item.path) previewItem.value = null;
    previewOpen.value = false;
    await load();
  } catch (cause) {
    notify(`重命名时出错：${describeError(cause)}。确认站点文件夹可写后重试。`, 'error', 'media-rename');
  } finally {
    renaming.value = false;
  }
}

function openDelete(item: MediaItem, close?: () => void): void {
  if (close) close();
  menuPath.value = '';
  deleteItem.value = item;
  deleteOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  const item = deleteItem.value;
  if (!item || deleting.value) return;
  if (!session.siteDir) {
    notify('还没打开站点，先打开站点再删除图片。', 'error', 'media-delete');
    return;
  }
  deleting.value = true;
  try {
    const result = await window.xiao.media.delete(
      session.siteDir,
      [item.path],
      item.refs > 0,
    );
    if (!result.ok) {
      notify(`没能删除：${result.message}。刷新列表确认图片还在后重试。`, 'error', 'media-delete');
      return;
    }
    const moved = result.data.trashed.length;
    notify(
      moved > 0
        ? `已把 ${item.name} 移入回收区（${result.data.trashDir}）`
        : `没有找到 ${item.name}，列表可能已经变了，刷新看看。`,
      moved > 0 ? 'info' : 'error',
      'media-delete',
    );
    deleteOpen.value = false;
    deleteItem.value = null;
    if (previewItem.value?.path === item.path) {
      previewItem.value = null;
      previewOpen.value = false;
    }
    await load();
  } catch (cause) {
    notify(`删除时出错：${describeError(cause)}。确认站点文件夹可写后重试。`, 'error', 'media-delete');
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  menuPath.value = '';
});

watch(
  () => session.siteDir,
  async () => {
    menuPath.value = '';
    previewOpen.value = false;
    await load();
  },
);
</script>

<template>
  <div
    class="media"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="toolbar">
      <UiInput
        v-model="query"
        class="search"
        size="sm"
        :icon="icons.seo"
        placeholder="搜索文件名或路径"
        aria-label="搜索媒体"
      />
      <UiSegmented v-model="filterKey" :items="filterItems" />
      <div class="grow" />
      <UiSegmented v-model="viewKey" :items="VIEW_ITEMS" />
      <UiTooltip label="刷新媒体列表">
        <UiButton
          variant="ghost"
          size="sm"
          :icon="icons.refresh"
          aria-label="刷新媒体列表"
          :disabled="loading"
          @click="load"
        />
      </UiTooltip>
      <UiButton
        variant="primary"
        size="sm"
        :icon-left="icons.upload"
        :loading="uploading"
        :disabled="!session.siteDir"
        @click="triggerUpload"
      >
        上传图片
      </UiButton>
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        multiple
        :accept="ACCEPT"
        @change="onFilesPicked"
      />
    </div>

    <p v-if="session.siteDir" class="summary">
      共 {{ items.length }} 张图片 · {{ copy.mediaUnused }} {{ unusedCount }} 张 · 扫描
      <code>src/content/posts</code> 与 <code>public</code>
    </p>

    <div v-if="!session.siteDir" class="state">
      <UiEmpty
        :icon="icons.image"
        title="先打开一个站点"
        description="媒体库按站点扫描；打开或新建站点后，图片会按引用情况列在这里。"
      >
        <template #action>
          <UiButton variant="primary" size="sm" @click="router.push('/')">打开站点</UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="loading" class="state">
      <UiSpinner :size="22" label="正在扫描媒体" />
    </div>

    <div v-else-if="error" class="state">
      <UiEmpty :icon="icons.alert" title="读取媒体库失败" :description="error">
        <template #action>
          <UiButton variant="default" size="sm" :icon-left="icons.refresh" @click="load">
            重试
          </UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="items.length === 0" class="state">
      <UiEmpty :icon="icons.image" title="还没有图片" :description="copy.mediaEmpty">
        <template #action>
          <UiButton variant="primary" size="sm" :icon-left="icons.upload" @click="triggerUpload">
            上传图片
          </UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="visible.length === 0" class="state">
      <UiEmpty
        :icon="icons.seo"
        title="没有匹配的图片"
        :description="
          filter === 'unused'
            ? '当前没有未被引用的图片；切到「全部」可以看全部图片。'
            : `没有文件名或路径能匹配「${query.trim()}」。换个关键词，或清空搜索。`
        "
      >
        <template #action>
          <UiButton variant="default" size="sm" @click="query = ''; filter = 'all'">
            清空筛选
          </UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="view === 'grid'" class="grid">
      <article v-for="item in visible" :key="item.path" class="card" :class="{ 'is-unused': !item.used }">
        <button type="button" class="thumb" :aria-label="`预览 ${item.name}`" @click="openPreview(item)">
          <img
            v-if="!broken.has(item.path)"
            :src="item.url"
            :alt="item.name"
            loading="lazy"
            @error="markBroken(item.path)"
          />
          <span v-else class="thumb-fallback"><UiIcon :path="icons.image" :size="28" /></span>
          <UiBadge v-if="!item.used" class="thumb-flag" tone="warn">未引用</UiBadge>
        </button>
        <div class="card-foot">
          <div class="card-text">
            <span class="name" :title="item.path">{{ item.name }}</span>
            <span class="meta">
              {{ formatSize(item.size) }} ·
              {{ item.refs > 0 ? `引用 ${item.refs}` : '未引用' }}
            </span>
          </div>
          <div class="card-actions">
            <UiTooltip label="复制 Markdown 引用">
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.code"
                aria-label="复制 Markdown 引用"
                @click="copyMarkdown(item)"
              />
            </UiTooltip>
            <UiPopover
              :model-value="menuPath === item.path"
              placement="bottom-end"
              @update:model-value="(open) => setMenu(item.path, open)"
            >
              <template #trigger>
                <UiButton
                  variant="ghost"
                  size="sm"
                  :icon="icons.more"
                  aria-label="图片操作"
                />
              </template>
              <template #default="{ close }">
                <div class="menu">
                  <button class="menu-item" type="button" @click="openPreview(item); close()">
                    <UiIcon :path="icons.preview" :size="16" />
                    预览
                  </button>
                  <button class="menu-item" type="button" @click="copySitePath(item, close)">
                    <UiIcon :path="icons.files" :size="16" />
                    复制站内路径
                  </button>
                  <button class="menu-item" type="button" @click="openRename(item, close)">
                    <UiIcon :path="icons.edit" :size="16" />
                    重命名
                  </button>
                  <button
                    class="menu-item menu-item--danger"
                    type="button"
                    @click="openDelete(item, close)"
                  >
                    <UiIcon :path="icons.trash" :size="16" />
                    删除
                  </button>
                </div>
              </template>
            </UiPopover>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="list">
      <UiRow v-for="item in visible" :key="item.path" @click="openPreview(item)">
        <template #icon>
          <img
            v-if="!broken.has(item.path)"
            class="row-thumb"
            :src="item.url"
            alt=""
            loading="lazy"
            @error="markBroken(item.path)"
          />
          <span v-else class="thumb-fallback row-thumb"><UiIcon :path="icons.image" :size="16" /></span>
        </template>
        <span class="row-main">
          <span class="name">{{ item.name }}</span>
          <span class="path">{{ item.path }}</span>
        </span>
        <template #meta>
          <span class="meta">{{ formatSize(item.size) }}</span>
          <UiBadge :tone="item.used ? 'neutral' : 'warn'">
            {{ item.refs > 0 ? `引用 ${item.refs}` : '未引用' }}
          </UiBadge>
          <span class="row-actions" @click.stop>
            <UiPopover
              :model-value="menuPath === item.path"
              placement="bottom-end"
              @update:model-value="(open) => setMenu(item.path, open)"
            >
              <template #trigger>
                <UiButton
                  variant="ghost"
                  size="sm"
                  :icon="icons.more"
                  aria-label="图片操作"
                />
              </template>
              <template #default="{ close }">
                <div class="menu">
                  <button class="menu-item" type="button" @click="copyMarkdown(item); close()">
                    <UiIcon :path="icons.code" :size="16" />
                    复制 Markdown 引用
                  </button>
                  <button class="menu-item" type="button" @click="copySitePath(item, close)">
                    <UiIcon :path="icons.files" :size="16" />
                    复制站内路径
                  </button>
                  <button class="menu-item" type="button" @click="openRename(item, close)">
                    <UiIcon :path="icons.edit" :size="16" />
                    重命名
                  </button>
                  <button
                    class="menu-item menu-item--danger"
                    type="button"
                    @click="openDelete(item, close)"
                  >
                    <UiIcon :path="icons.trash" :size="16" />
                    删除
                  </button>
                </div>
              </template>
            </UiPopover>
          </span>
        </template>
      </UiRow>
    </div>

    <div v-if="dragActive" class="drop-veil">
      <div class="drop-box">
        <UiIcon :path="icons.upload" :size="28" />
        <span>松开就把图片传到 <code>public/media/&lt;年份&gt;/</code></span>
      </div>
    </div>

    <UiDialog v-model="previewOpen" :title="previewItem?.name ?? '预览图片'" :width="760">
      <div v-if="previewItem" class="preview">
        <img class="preview-img" :src="previewItem.url" :alt="previewItem.name" />
        <dl class="preview-meta">
          <div>
            <dt>路径</dt>
            <dd>{{ previewItem.path }}</dd>
          </div>
          <div>
            <dt>大小</dt>
            <dd>{{ formatSize(previewItem.size) }}</dd>
          </div>
          <div>
            <dt>引用</dt>
            <dd>{{ previewItem.refs > 0 ? `${previewItem.refs} 处` : '未引用' }}</dd>
          </div>
          <div>
            <dt>修改时间</dt>
            <dd>{{ formatTime(previewItem.mtime) }}</dd>
          </div>
        </dl>
      </div>
      <template #actions>
        <UiButton variant="ghost" @click="previewOpen = false">关闭</UiButton>
        <UiButton variant="default" :icon-left="icons.code" @click="copyMarkdownForPreview">
          复制 Markdown 引用
        </UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model="renameOpen" title="重命名图片" :width="460">
      <div class="form">
        <UiField
          label="新文件名"
          hint="扩展名可以改；改完会尽力更新 md/html/astro/css 里的精确路径引用。"
          :error="renameError"
          required
        >
          <UiInput
            v-model="renameName"
            :invalid="!!renameError"
            autofocus
            @keydown.enter="submitRename"
          />
        </UiField>
        <p class="hint">
          当前路径：<code>{{ renameItem?.path }}</code>
        </p>
      </div>
      <template #actions>
        <UiButton variant="ghost" @click="renameOpen = false">取消</UiButton>
        <UiButton
          variant="primary"
          :loading="renaming"
          :disabled="!!renameError || !renameName.trim()"
          @click="submitRename"
        >
          重命名
        </UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model="deleteOpen" title="删除图片" :width="460">
      <div class="form">
        <p class="confirm-lead">把「{{ deleteItem?.name }}」移入回收区？</p>
        <p class="confirm-hint">
          文件会移动到站点的 <code>.xiao/trash/</code>，之后还能从磁盘找回；不会直接硬删。
        </p>
        <div v-if="(deleteItem?.refs ?? 0) > 0" class="warn">
          <UiIcon :path="icons.alert" :size="16" />
          <span>
            这张图还被引用 {{ deleteItem?.refs }} 处；删除后这些引用会变成死链。确认要强制删除吗？
          </span>
        </div>
      </div>
      <template #actions>
        <UiButton variant="ghost" @click="deleteOpen = false">取消</UiButton>
        <UiButton
          variant="danger"
          :loading="deleting"
          @click="confirmDelete"
        >
          {{ (deleteItem?.refs ?? 0) > 0 ? '仍然删除' : '移入回收区' }}
        </UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.media {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  height: 100%;
  min-height: 0;
}

.toolbar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-s2);
}

.search {
  flex: 1 1 200px;
  min-width: 160px;
  max-width: 320px;
}

.grow {
  flex: 1;
}

.file-input {
  display: none;
}

.summary {
  flex: none;
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.summary code,
.hint code,
.confirm-hint code,
.drop-box code {
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.state {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.grid {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--ui-s3);
  align-content: start;
  min-height: 0;
  overflow: auto;
  padding-right: var(--ui-s1);
}

.card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
  transition: border-color var(--ui-dur) var(--ui-ease);
}

.card:hover {
  border-color: var(--ui-line-2);
}

.thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 4 / 3;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-bottom: 1px solid var(--ui-line);
  background: var(--ui-raise);
  cursor: zoom-in;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.thumb-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-3);
}

.thumb-flag {
  position: absolute;
  top: var(--ui-s2);
  left: var(--ui-s2);
}

.card-foot {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  padding: var(--ui-s2);
}

.card-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.name {
  overflow: hidden;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.meta {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  white-space: nowrap;
}

.card-actions {
  display: flex;
  flex: none;
  align-items: center;
}

.list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow: auto;
  padding-right: var(--ui-s1);
}

.row-thumb {
  width: var(--ui-s7);
  height: var(--ui-s7);
  border-radius: var(--ui-r-sm);
  object-fit: cover;
  background: var(--ui-raise);
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  line-height: 1.4;
}

.path {
  overflow: hidden;
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.row-actions {
  display: inline-flex;
  align-items: center;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
  padding: var(--ui-s1);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
  min-height: var(--ui-h-sm);
  padding: 0 var(--ui-s2);
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.menu-item--danger {
  color: var(--ui-danger);
}

.menu-item--danger:hover {
  background: var(--ui-danger-weak);
  color: var(--ui-danger);
}

.drop-veil {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--ui-accent);
  border-radius: var(--ui-r);
  background: var(--ui-accent-weak);
  backdrop-filter: blur(2px);
  pointer-events: none;
  z-index: var(--ui-z-sticky);
}

.drop-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s5) var(--ui-s6);
  border-radius: var(--ui-r-lg);
  background: var(--ui-panel);
  box-shadow: var(--ui-shadow-2);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.warn {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  padding: var(--ui-s2) var(--ui-s3);
  border-radius: var(--ui-r-sm);
  background: var(--ui-warn-weak);
  color: var(--ui-warn);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.hint {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  overflow-wrap: anywhere;
}

.confirm-lead {
  color: var(--ui-text);
  font-size: var(--ui-fs-3);
  line-height: var(--ui-lh);
  overflow-wrap: anywhere;
}

.confirm-hint {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.preview {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.preview-img {
  max-height: 52vh;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  object-fit: contain;
}

.preview-meta {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  margin: 0;
}

.preview-meta div {
  display: flex;
  gap: var(--ui-s2);
  min-width: 0;
}

.preview-meta dt {
  flex: none;
  width: var(--ui-s8);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.preview-meta dd {
  min-width: 0;
  margin: 0;
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .search {
    max-width: none;
  }

  .grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}
</style>
