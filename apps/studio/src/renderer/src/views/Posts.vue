<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
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
  UiSelect,
  UiSpinner,
} from '../ui/index.ts';

interface Post {
  slug: string;
  title: string;
  category: string;
  draft: boolean;
  format: 'markdown' | 'html';
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_CATEGORY = '生活';
const CREATE_FORMATS: { value: string; label: string }[] = [
  { value: 'markdown', label: 'Markdown 文章' },
  { value: 'html', label: 'HTML 文章' },
];

/** Shell 依赖这个接口：props.active + select 事件都不能改。 */
const props = defineProps<{ active?: string }>();
const emit = defineEmits<{ select: [slug: string] }>();

const session = useSession();

const posts = ref<Post[]>([]);
const loading = ref(true);
const error = ref('');
const query = ref('');
/** 当前展开「更多」菜单的文章 slug，保证同时只开一个菜单。 */
const menuSlug = ref('');

const createOpen = ref(false);
const createTitle = ref('');
const createCategory = ref(DEFAULT_CATEGORY);
const createFormat = ref<'markdown' | 'html'>('markdown');
const createFormatKey = computed({
  get: () => createFormat.value,
  set: (value: string | number) => {
    createFormat.value = value === 'html' ? 'html' : 'markdown';
  },
});const createTouched = ref(false);
const creating = ref(false);

const renameOpen = ref(false);
const renamePost = ref<Post | null>(null);
const renameValue = ref('');
const renameTouched = ref(false);
const renaming = ref(false);

const deleteOpen = ref(false);
const deletePost = ref<Post | null>(null);
const deleting = ref(false);

const keyword = computed(() => query.value.trim().toLowerCase());
const searching = computed(() => keyword.value.length > 0);

/** 按标题 / 分类过滤（搜索框的语义）。 */
const filtered = computed(() => {
  if (!searching.value) return posts.value;
  return posts.value.filter(
    (post) =>
      post.title.toLowerCase().includes(keyword.value) ||
      post.category.toLowerCase().includes(keyword.value),
  );
});

/** 分类分组：分类名做小标题，组内按标题排序。 */
const groups = computed(() => {
  const grouped = new Map<string, Post[]>();
  for (const post of filtered.value) {
    const name = post.category.trim() || '未分类';
    const items = grouped.get(name);
    if (items) items.push(post);
    else grouped.set(name, [post]);
  }
  return [...grouped.entries()]
    .map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'));
});

/** 新建文章时可选分类：现有分类 + 默认「生活」。 */
const categoryOptions = computed(() => {
  const names = new Set(posts.value.map((post) => post.category.trim()).filter(Boolean));
  names.add(DEFAULT_CATEGORY);
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans')).map((name) => ({
    value: name,
    label: name,
  }));
});

const createTitleError = computed(() =>
  createTouched.value && !createTitle.value.trim() ? '标题不能为空' : '',
);

const renameError = computed(() => {
  if (!renameTouched.value) return '';
  const next = renameValue.value.trim();
  if (!next) return '新地址不能为空';
  if (!SLUG_PATTERN.test(next)) return '只能用...，例如 zhou-mo-san-bu';
  if (renamePost.value && next === renamePost.value.slug) return '和现在的地址一样';
  return '';
});

function describeError(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message.trim();
  return '未知错误';
}

/** 读取列表；列表为空时才显示整块加载态，刷新时保留旧内容避免闪烁。 */
async function load(): Promise<void> {
  if (!session.siteDir) {
    posts.value = [];
    error.value = '';
    loading.value = false;
    return;
  }
  if (posts.value.length === 0) loading.value = true;
  error.value = '';
  try {
    const result = await window.xiao.content.list(session.siteDir);
    if (!result.ok) {
      posts.value = [];
      error.value = `${result.message}。点重试再读一次；仍失败就确认站点文件夹还在。`;
      return;
    }
    posts.value = result.data;
  } catch (cause) {
    posts.value = [];
    error.value = `读取文章列表时出错（${describeError(cause)}）。点重试再读一次；仍失败就重新打开站点。`;
  } finally {
    loading.value = false;
  }
}

/** 只有在没有选中文章时才自动选中第一篇，避免覆盖用户刚做的选择。 */
function ensureSelection(): void {
  if (!props.active && posts.value[0]) emit('select', posts.value[0].slug);
}

function setMenu(slug: string, open: boolean): void {
  if (open) menuSlug.value = slug;
  else if (menuSlug.value === slug) menuSlug.value = '';
}

function openCreate(): void {
  menuSlug.value = '';
  createTitle.value = '';
  createFormat.value = 'markdown';
  createCategory.value = categoryOptions.value.some((option) => option.value === DEFAULT_CATEGORY)
    ? DEFAULT_CATEGORY
    : (categoryOptions.value[0]?.value ?? DEFAULT_CATEGORY);
  createTouched.value = false;
  createOpen.value = true;
}

async function submitCreate(): Promise<void> {
  createTouched.value = true;
  const title = createTitle.value.trim();
  if (!title || creating.value) return;
  if (!session.siteDir) {
    notify('还没打开站点，先打开或新建一个站点再写文章。', 'error');
    return;
  }
  creating.value = true;
  try {
    const result = await window.xiao.content.create(
      session.siteDir,
      title,
      createCategory.value || DEFAULT_CATEGORY,
      createFormat.value,
    );
    if (!result.ok) {
      notify(`没能新建文章：${result.message}。检查站点文件夹权限后重试。`, 'error');
      return;
    }
    createOpen.value = false;
    const kind = createFormat.value === 'html' ? 'HTML 文章' : 'Markdown 文章';
    notify(`已新建${kind}《${result.data.title}》`, 'info', 'post-create');
    emit('select', result.data.slug);
    await load();
  } catch (cause) {
    notify(`新建文章时出错：${describeError(cause)}。确认站点文件夹可写后重试。`, 'error');
  } finally {
    creating.value = false;
  }
}

function selectAll(event: Event): void {
  if (event.target instanceof HTMLInputElement) event.target.select();
}

/** 转换格式由 Editor 完成（它才拿得到当前正文/DOM）；这里只发请求并确保选中该文章。 */
function requestConvert(post: Post, close: () => void): void {
  close();
  menuSlug.value = '';
  if (post.slug !== props.active) emit('select', post.slug);
  window.dispatchEvent(new CustomEvent('xiao:convert-post', { detail: { slug: post.slug } }));
}

function openRename(post: Post, close: () => void): void {  close();
  menuSlug.value = '';
  renamePost.value = post;
  renameValue.value = post.slug;
  renameTouched.value = false;
  renameOpen.value = true;
}

async function submitRename(): Promise<void> {
  const post = renamePost.value;
  if (!post || renaming.value) return;
  renameTouched.value = true;
  const next = renameValue.value.trim();
  if (!next) return;
  if (next === post.slug) {
    renameOpen.value = false;
    return;
  }
  if (!SLUG_PATTERN.test(next)) return;
  if (!session.siteDir) {
    notify('还没打开站点，先打开站点再改文章地址。', 'error');
    return;
  }
  renaming.value = true;
  try {
    const result = await window.xiao.content.rename(session.siteDir, post.slug, next);
    if (!result.ok) {
      notify(`没能重命名：${result.message}。换个不冲突的地址后重试。`, 'error');
      return;
    }
    renameOpen.value = false;
    notify(`地址已从 ${result.data.from} 改成 ${result.data.to}`, 'info', 'post-rename');
    if (props.active === result.data.from) emit('select', result.data.to);
    await load();
  } catch (cause) {
    notify(`重命名时出错：${describeError(cause)}。确认站点文件夹可写后重试。`, 'error');
  } finally {
    renaming.value = false;
  }
}

function openDelete(post: Post, close: () => void): void {
  close();
  menuSlug.value = '';
  deletePost.value = post;
  deleteOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  const post = deletePost.value;
  if (!post || deleting.value) return;
  if (!session.siteDir) {
    notify('还没打开站点，先打开站点再删除文章。', 'error');
    return;
  }
  deleting.value = true;
  try {
    const result = await window.xiao.content.remove(session.siteDir, post.slug);
    if (!result.ok) {
      notify(`没能删除：${result.message}。确认没有别的程序占用这个文件后重试。`, 'error');
      return;
    }
    const wasActive = props.active === post.slug;
    deleteOpen.value = false;
    deletePost.value = null;
    notify(`已把「${post.title}」移入回收区`, 'info', 'post-delete');
    await load();
    if (wasActive) emit('select', posts.value[0]?.slug ?? '');
  } catch (cause) {
    notify(`删除时出错：${describeError(cause)}。确认站点文件夹可写后重试。`, 'error');
  } finally {
    deleting.value = false;
  }
}

onMounted(async () => {
  await load();
  ensureSelection();
});

watch(
  () => session.siteDir,
  async () => {
    menuSlug.value = '';
    await load();
    ensureSelection();
  },
);
</script>

<template>
  <div class="posts">
    <div class="toolbar">
      <UiInput
        v-model="query"
        class="search"
        size="sm"
        :icon="icons.seo"
        placeholder="搜索标题 / 分类"
        aria-label="搜索文章"
      />
      <UiButton variant="primary" size="sm" :icon-left="icons.plus" @click="openCreate">
        新建
      </UiButton>
    </div>

    <div v-if="!session.siteDir" class="state">
      <UiEmpty
        :icon="icons.repo"
        title="先打开一个站点"
        description="打开或新建站点后，文章会按分类列在这里。"
      />
    </div>

    <div v-else-if="loading" class="state">
      <UiSpinner :size="22" label="正在读取文章" />
    </div>

    <div v-else-if="error" class="state">
      <UiEmpty :icon="icons.alert" title="读取文章失败" :description="error">
        <template #action>
          <UiButton variant="default" size="sm" :icon-left="icons.refresh" @click="load">
            重试
          </UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="posts.length === 0" class="state">
      <UiEmpty
        :icon="icons.posts"
        title="还没有文章"
        description="新建第一篇后，它会按分类出现在这里。"
      >
        <template #action>
          <UiButton variant="primary" size="sm" :icon-left="icons.plus" @click="openCreate">
            新建文章
          </UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="filtered.length === 0" class="state">
      <UiEmpty
        :icon="icons.seo"
        title="没有匹配的文章"
        :description="`没有标题或分类能匹配「${query.trim()}」的文章。换个关键词，或清空搜索。`"
      >
        <template #action>
          <UiButton variant="default" size="sm" @click="query = ''">清空搜索</UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else class="groups">
      <section v-for="group in groups" :key="group.name" class="group">
        <header class="group-head">
          <span class="group-name">{{ group.name }}</span>
          <span class="group-count">{{ group.items.length }} 篇</span>
        </header>
        <div class="rows">
          <div
            v-for="post in group.items"
            :key="post.slug"
            class="row-wrap"
            :class="{ 'is-menu-open': menuSlug === post.slug }"
          >
            <UiRow :selected="post.slug === active" @click="emit('select', post.slug)">
              <span class="post-title" :title="post.title">{{ post.title }}</span>
              <template #meta>
                <UiBadge v-if="post.format === 'html'" tone="accent">HTML</UiBadge>
                <UiBadge v-if="post.draft" tone="warn">草稿</UiBadge>
                <span class="more-wrap" @click.stop @keydown.stop>
                  <UiPopover
                    :model-value="menuSlug === post.slug"
                    placement="bottom-end"
                    @update:model-value="(open) => setMenu(post.slug, open)"
                  >
                    <template #trigger>
                      <UiButton
                        class="more"
                        variant="ghost"
                        size="sm"
                        :icon="icons.more"
                        aria-label="更多操作"
                      />
                    </template>
                    <template #default="{ close }">
                      <div class="menu">
                        <button class="menu-item" type="button" @click="requestConvert(post, close)">
                          <UiIcon :path="icons.code" :size="16" />
                          转换格式（{{ post.format === 'markdown' ? 'MD → HTML' : 'HTML → MD' }}）
                        </button>
                        <button class="menu-item" type="button" @click="openRename(post, close)">
                          <UiIcon :path="icons.edit" :size="16" />
                          重命名
                        </button>
                        <button
                          class="menu-item menu-item--danger"
                          type="button"
                          @click="openDelete(post, close)"
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
        </div>
      </section>
      <p class="total">
        共 {{ posts.length }} 篇<template v-if="searching">，匹配 {{ filtered.length }} 篇</template>
      </p>
    </div>

    <UiDialog v-model="createOpen" title="新建文章" :width="420">
      <div class="form">
        <UiField label="标题" :error="createTitleError" required>
          <UiInput
            v-model="createTitle"
            placeholder="例如：周末散步"
            autofocus
            :invalid="!!createTitleError"
            @keydown.enter="submitCreate"
          />
        </UiField>
        <UiField label="格式" hint="Markdown 用所见即所得；HTML 用源码编辑，正文按原样保存。">
          <UiSelect v-model="createFormatKey" :options="CREATE_FORMATS" />
        </UiField>
        <UiField label="分类" hint="分类决定左侧列表的分组，默认「生活」。">
          <UiSelect v-model="createCategory" :options="categoryOptions" />
        </UiField>
      </div>
      <template #actions>
        <UiButton variant="ghost" @click="createOpen = false">取消</UiButton>
        <UiButton
          variant="primary"
          :loading="creating"
          :disabled="!createTitle.trim()"
          @click="submitCreate"
        >
          新建
        </UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model="renameOpen" title="重命名文章" :width="420">
      <div class="form">
        <UiField
          label="新地址"
          hint="地址决定文章链接与文件夹名；标题请在编辑器里改。"
          :error="renameError"
          required
        >
          <UiInput
            v-model="renameValue"
            placeholder="例如：zhou-mo-san-bu"
            autofocus
            :invalid="!!renameError"
            @focus="selectAll"
            @keydown.enter="submitRename"
          />
        </UiField>
      </div>
      <template #actions>
        <UiButton variant="ghost" @click="renameOpen = false">取消</UiButton>
        <UiButton
          variant="primary"
          :loading="renaming"
          :disabled="!renameValue.trim() || renameValue.trim() === renamePost?.slug"
          @click="submitRename"
        >
          保存
        </UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model="deleteOpen" title="删除文章" :width="420">
      <div class="form">
        <p class="confirm-lead">把「{{ deletePost?.title }}」移入回收区？</p>
        <p class="confirm-hint">文件会移到站点的回收区，之后还能从那里找回。</p>
      </div>
      <template #actions>
        <UiButton variant="ghost" @click="deleteOpen = false">取消</UiButton>
        <UiButton variant="danger" :loading="deleting" @click="confirmDelete">移入回收区</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.posts {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  height: 100%;
  min-height: 0;
}

.toolbar {
  display: flex;
  flex: none;
  gap: var(--ui-s2);
  align-items: center;
}

.search {
  flex: 1;
  min-width: 0;
}

.state {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.groups {
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
  color: var(--ui-text-3);
  font-weight: 400;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-wrap {
  min-width: 0;
}

.post-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-wrap {
  display: inline-flex;
}

.more {
  opacity: 0;
  transition: opacity var(--ui-dur) var(--ui-ease);
}

.row-wrap:hover .more,
.row-wrap.is-menu-open .more,
.more:focus-visible {
  opacity: 1;
}

@media (hover: none) {
  .more {
    opacity: 1;
  }
}

.total {
  margin: 0;
  padding: var(--ui-s1) var(--ui-s2) var(--ui-s3);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  text-align: center;
}

.menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
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

.form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
}

.confirm-lead {
  color: var(--ui-text);
  font-size: var(--ui-fs-3);
  line-height: var(--ui-lh);
  overflow-wrap: anywhere;
}

.confirm-hint {
  margin-top: var(--ui-s2);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}
</style>
