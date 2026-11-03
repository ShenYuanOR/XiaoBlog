<script setup lang="ts">
/**
 * 选中 HTML 文章块之后的样式面板。
 *
 * 只读写站点 xiao.css 的 class 令牌；面板不认识的 class 原样保留。
 * 图片的地址、替代文本、图注、比例属于节点属性，不写进 class。
 */

import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  CALLOUT_TYPES,
  IMAGE_RATIOS,
  TOKEN_GROUPS,
  groupValue,
  hideTokens,
  toggleHide,
  withColumnsValue,
  withGroupValue,
  type HtmlBlockInfo,
} from '../editor/block-style.ts';
import { imageDisplaySrc, mediaSourcePath } from '../editor/asset-url.ts';
import { notify } from '../notice.ts';
import { UiButton, UiDialog, UiField, UiInput, UiSelect, UiSpinner } from '../ui/index.ts';

interface MediaRow {
  path: string;
  name: string;
  url: string;
  used: boolean;
}

const props = defineProps<{
  block: HtmlBlockInfo;
  siteDir: string;
  slug: string;
}>();

const emit = defineEmits<{
  classes: [value: string[]];
  attrs: [value: Record<string, string | number>];
  columnsCount: [value: number];
  deselect: [];
}>();

const src = ref('');
const alt = ref('');
const caption = ref('');
const ratio = ref('auto');
const href = ref('#');
const calloutType = ref('info');
const mediaOpen = ref(false);
const mediaLoading = ref(false);
const mediaRows = ref<MediaRow[]>([]);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const breakpoints = ref<{ id: string; label: string }[]>([]);

function syncFromBlock(block: HtmlBlockInfo): void {
  src.value = String(block.attrs.src ?? '');
  alt.value = String(block.attrs.alt ?? '');
  caption.value = String(block.attrs.caption ?? '');
  ratio.value = String(block.attrs.ratio ?? 'auto');
  href.value = String(block.attrs.href ?? '#');
  calloutType.value = String(block.attrs.type ?? 'info');
}

watch(() => props.block, syncFromBlock, { immediate: true });

const previewSrc = computed(() => imageDisplaySrc(src.value, props.siteDir, props.slug));
const hiddenClasses = computed(() => new Set(hideTokens(props.block.classes)));
const hideOptions = computed(() => [
  { id: 'desktop', label: '桌面', token: 'x-hide-desktop' },
  ...breakpoints.value.map((item) => ({
    id: item.id,
    label: item.label,
    token: `x-hide-${item.id}`,
  })),
]);

async function loadBreakpoints(): Promise<void> {
  try {
    const result = await window.xiao.article.css(props.siteDir);
    if (result.ok) breakpoints.value = result.data.breakpoints ?? [];
  } catch {
    breakpoints.value = [];
  }
}

onMounted(() => {
  void loadBreakpoints();
});

watch(() => props.siteDir, () => {
  void loadBreakpoints();
});

function groupValueOf(key: string): string {
  return groupValue(props.block.classes, key);
}

function changeGroup(key: string, value: string): void {
  emit('classes', withGroupValue(props.block.classes, key, value));
}

function changeColumns(value: string): void {
  emit('classes', withColumnsValue(props.block.classes, value));
}

function changeHide(token: string, on: boolean): void {
  emit('classes', toggleHide(props.block.classes, token, on));
}

function pushAttrs(patch: Record<string, string | number>): void {
  emit('attrs', patch);
}

function openMedia(): void {
  mediaOpen.value = true;
  void loadMedia();
}

async function loadMedia(): Promise<void> {
  mediaLoading.value = true;
  try {
    const result = await window.xiao.media.list(props.siteDir);
    if (!result.ok) {
      notify(`读不到媒体库：${result.message}`, 'error', 'block-media');
      mediaRows.value = [];
      return;
    }
    mediaRows.value = result.data.map((item) => ({
      path: item.path,
      name: item.name,
      url: item.url,
      used: item.used,
    }));
  } finally {
    mediaLoading.value = false;
  }
}

async function chooseMedia(row: MediaRow): Promise<void> {
  const next = mediaSourcePath(row.path, props.slug);
  pushAttrs({ src: next });
  src.value = next;
  mediaOpen.value = false;
}

function pickUpload(): void {
  fileInput.value?.click();
}

async function onUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || uploading.value) return;
  uploading.value = true;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    bytes.forEach((item) => {
      binary += String.fromCharCode(item);
    });
    const saved = await window.xiao.content.saveImage(
      props.siteDir,
      props.slug,
      file.name,
      btoa(binary),
    );
    if (!saved.ok) {
      notify(`图片没能保存：${saved.message}`, 'error', 'block-media-upload');
      return;
    }
    pushAttrs({ src: saved.data });
    src.value = saved.data;
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <section class="block-style">
    <header class="block-style__head">
      <div class="block-style__title">
        <span class="block-style__eyebrow">区块样式</span>
        <strong>{{ block.label }}</strong>
      </div>
      <UiButton size="sm" variant="ghost" @click="emit('deselect')">取消选择</UiButton>
    </header>

    <section v-if="block.isImage" class="bs-section">
      <h4>图片</h4>
      <div class="image-row">
        <div class="image-preview">
          <img v-if="previewSrc" :src="previewSrc" alt="" />
          <span v-else>还没有图片</span>
        </div>
        <div class="image-actions">
          <UiButton size="sm" @click="openMedia">从媒体库选择</UiButton>
          <UiButton size="sm" :loading="uploading" @click="pickUpload">上传图片</UiButton>
        </div>
      </div>
      <UiField label="图片地址" hint="支持 ./文章目录、/media/... 和外部链接">
        <UiInput
          v-model="src"
          size="sm"
          placeholder="./cover.jpg"
          @change="pushAttrs({ src })"
        />
      </UiField>
      <UiField label="替代文本">
        <UiInput
          v-model="alt"
          size="sm"
          placeholder="描述图片内容"
          @change="pushAttrs({ alt })"
        />
      </UiField>
      <UiField label="图注">
        <UiInput
          v-model="caption"
          size="sm"
          placeholder="显示在图片下方"
          @change="pushAttrs({ caption })"
        />
      </UiField>
      <UiField label="宽高比">
        <UiSelect
          :model-value="ratio"
          :options="IMAGE_RATIOS"
          size="sm"
          @update:model-value="ratio = String($event); pushAttrs({ ratio })"
        />
      </UiField>
    </section>

    <section v-if="block.isButton" class="bs-section">
      <h4>按钮</h4>
      <UiField label="链接地址" hint="站内用 /posts/...，外部用完整网址">
        <UiInput v-model="href" size="sm" placeholder="https://" @change="pushAttrs({ href })" />
      </UiField>
    </section>

    <section v-if="block.isCallout" class="bs-section">
      <h4>提示框</h4>
      <UiField label="类型">
        <UiSelect
          :model-value="calloutType"
          :options="CALLOUT_TYPES"
          size="sm"
          @update:model-value="calloutType = String($event); pushAttrs({ type: calloutType })"
        />
      </UiField>
    </section>

    <section v-if="block.isColumns" class="bs-section">
      <h4>分栏</h4>
      <UiField label="栏数" hint="减少栏数时，只有空栏会被移除">
        <UiSelect
          :model-value="String(block.attrs.count ?? '2')"
          :options="[
            { value: '2', label: '两栏' },
            { value: '3', label: '三栏' },
            { value: '4', label: '四栏' },
          ]"
          size="sm"
          @update:model-value="emit('columnsCount', Number($event))"
        />
      </UiField>
    </section>

    <p v-if="!block.canStyle" class="bs-note">
      原始 HTML 块不参与样式令牌；用块工具条里的「改 HTML」改结构。
    </p>

    <template v-if="block.canStyle">
    <section class="bs-section">
      <h4>布局</h4>
      <UiField v-for="key in ['width', 'pad']" :key="key" :label="TOKEN_GROUPS[key]?.label ?? key">
        <UiSelect
          :model-value="groupValueOf(key)"
          :options="TOKEN_GROUPS[key]?.options ?? []"
          size="sm"
          @update:model-value="changeGroup(key, String($event))"
        />
      </UiField>
      <template v-if="block.canColumns">
        <UiField v-if="!block.isColumns" label="多栏" hint="把这一块里的内容排成多栏">
          <UiSelect
            :model-value="groupValueOf('cols')"
            :options="TOKEN_GROUPS.cols?.options ?? []"
            size="sm"
            @update:model-value="changeColumns(String($event))"
          />
        </UiField>
        <UiField label="栏间距">
          <UiSelect
            :model-value="groupValueOf('gap')"
            :options="TOKEN_GROUPS.gap?.options ?? []"
            size="sm"
            @update:model-value="changeGroup('gap', String($event))"
          />
        </UiField>
      </template>
      <UiField label="断点隐藏">
        <div class="hide-row">
          <button
            v-for="item in hideOptions"
            :key="item.id"
            type="button"
            class="hide-chip"
            :class="{ on: hiddenClasses.has(item.token) }"
            @click="changeHide(item.token, !hiddenClasses.has(item.token))"
          >
            {{ item.label }}
          </button>
        </div>
      </UiField>
    </section>

    <section class="bs-section">
      <h4>外观</h4>
      <UiField v-for="key in ['bg', 'radius', 'border', 'shadow']" :key="key" :label="TOKEN_GROUPS[key]?.label ?? key">
        <UiSelect
          :model-value="groupValueOf(key)"
          :options="TOKEN_GROUPS[key]?.options ?? []"
          size="sm"
          @update:model-value="changeGroup(key, String($event))"
        />
      </UiField>
    </section>

    <section v-if="block.isText" class="bs-section">
      <h4>文字</h4>
      <UiField label="字号">
        <UiSelect
          :model-value="groupValueOf('textSize')"
          :options="TOKEN_GROUPS.textSize?.options ?? []"
          size="sm"
          @update:model-value="changeGroup('textSize', String($event))"
        />
      </UiField>
      <UiField label="字重">
        <UiSelect
          :model-value="groupValueOf('weight')"
          :options="TOKEN_GROUPS.weight?.options ?? []"
          size="sm"
          @update:model-value="changeGroup('weight', String($event))"
        />
      </UiField>
      <UiField label="文字颜色">
        <UiSelect
          :model-value="groupValueOf('color')"
          :options="TOKEN_GROUPS.color?.options ?? []"
          size="sm"
          @update:model-value="changeGroup('color', String($event))"
        />
      </UiField>
      <UiField label="对齐">
        <UiSelect
          :model-value="groupValueOf('align')"
          :options="TOKEN_GROUPS.align?.options ?? []"
          size="sm"
          @update:model-value="changeGroup('align', String($event))"
        />
      </UiField>
    </section>
    </template>

    <input ref="fileInput" type="file" accept="image/*" class="hidden-input" @change="onUpload" />

    <UiDialog v-model="mediaOpen" title="选择图片" :width="720">
      <div v-if="mediaLoading" class="media-loading">
        <UiSpinner :size="16" />
        <span>正在读取媒体库…</span>
      </div>
      <div v-else-if="!mediaRows.length" class="media-empty">
        媒体库里还没有图片。先上传一张，或把图片放进文章目录。
      </div>
      <div v-else class="media-grid">
        <button
          v-for="row in mediaRows"
          :key="row.path"
          type="button"
          class="media-card"
          :title="row.path"
          @click="chooseMedia(row)"
        >
          <img :src="row.url" alt="" loading="lazy" />
          <span>{{ row.name }}</span>
        </button>
      </div>
      <template #actions>
        <UiButton size="sm" @click="mediaOpen = false">取消</UiButton>
      </template>
    </UiDialog>
  </section>
</template>

<style scoped>
.block-style {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
  padding-bottom: var(--ui-s4);
}

.block-style__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  padding-bottom: var(--ui-s2);
  border-bottom: 1px solid var(--ui-line);
}

.block-style__title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.block-style__eyebrow {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.block-style__title strong {
  color: var(--ui-text);
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.bs-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}

.bs-note {
  margin: 0;
  padding: var(--ui-s3);
  border: 1px dashed var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  line-height: 1.6;
}

.bs-section h4 {
  margin: 0;
  color: var(--ui-text-3);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
  font-weight: 500;
  letter-spacing: 0.04em;
}

.image-row {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.image-preview {
  display: grid;
  flex: none;
  width: 96px;
  height: 64px;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-bg);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s1);
}

.hide-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s1);
}

.hide-chip {
  height: 24px;
  padding: 0 var(--ui-s2);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-pill, 999px);
  background: transparent;
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
  cursor: pointer;
}

.hide-chip.on {
  border-color: var(--ui-accent);
  background: var(--ui-accent-weak);
  color: var(--ui-text);
}

.hidden-input {
  display: none;
}

.media-loading,
.media-empty {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s5);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--ui-s2);
  max-height: 420px;
  overflow: auto;
}

.media-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding: var(--ui-s1);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-bg);
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
  text-align: left;
  cursor: pointer;
}

.media-card:hover {
  border-color: var(--ui-accent);
  color: var(--ui-text);
}

.media-card img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
}

.media-card span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
