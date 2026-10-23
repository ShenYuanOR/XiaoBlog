<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import { UiButton, UiEmpty, UiSpinner, UiTree } from '../ui/index.ts';

/**
 * 开发者抽屉的文件树。
 * 数据来自 dev.files；只负责「列出文件 + 发出 open」，读盘/写盘/标签页归 DevDrawer。
 */

interface FileTreeNode {
  id: string;
  label: string;
  icon?: string;
  children?: FileTreeNode[];
}

interface DirNode {
  name: string;
  path: string;
  dirs: Map<string, DirNode>;
  files: string[];
}

const props = defineProps<{ active?: string }>();
const emit = defineEmits<{ open: [file: string] }>();

const session = useSession();
const files = ref<string[]>([]);
/** 打开抽屉时站点多半已经就位，先按「加载中」渲染，避免闪一下空态。 */
const loading = ref(Boolean(session.siteDir));
const error = ref('');

function buildTree(paths: string[]): FileTreeNode[] {
  const root: DirNode = { name: '', path: '', dirs: new Map(), files: [] };
  for (const path of paths) {
    const parts = path.split('/');
    let dir = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      if (!name) continue;
      const id = parts.slice(0, index + 1).join('/');
      let next = dir.dirs.get(name);
      if (!next) {
        next = { name, path: id, dirs: new Map(), files: [] };
        dir.dirs.set(name, next);
      }
      dir = next;
    }
    dir.files.push(path);
  }
  const toNodes = (dir: DirNode): FileTreeNode[] => {
    const dirs = [...dir.dirs.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((child) => ({
        id: child.path,
        label: child.name,
        icon: icons.files,
        children: toNodes(child),
      }));
    const leaves = [...dir.files]
      .sort((left, right) => left.localeCompare(right))
      .map((file) => ({ id: file, label: file.split('/').at(-1) ?? file }));
    return [...dirs, ...leaves];
  };
  return toNodes(root);
}

/** 默认展开顶层目录；有当前文件时，把它所在的整条路径也展开。 */
function defaultExpanded(paths: string[], active?: string): string[] {
  const ids = new Set<string>();
  for (const path of paths) {
    const top = path.split('/')[0];
    if (top && path.includes('/')) ids.add(top);
  }
  if (active) {
    const parts = active.split('/');
    for (let index = 1; index < parts.length; index += 1) ids.add(parts.slice(0, index).join('/'));
  }
  return [...ids];
}

const nodes = computed(() => buildTree(files.value));
const expanded = computed(() => defaultExpanded(files.value, props.active));

async function load(): Promise<void> {
  if (!session.siteDir) {
    files.value = [];
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await window.xiao.dev.files(session.siteDir);
    if (result.ok) {
      files.value = result.data;
    } else {
      files.value = [];
      error.value = result.message;
      notify(
        `读不到源码文件：${result.message}。请确认站点目录还在，或重新打开这个站点。`,
        'error',
        'dev-files',
      );
    }
  } catch (caught) {
    files.value = [];
    error.value = caught instanceof Error ? caught.message : '未知错误';
    notify(`读不到源码文件：${error.value}。请稍后重试。`, 'error', 'dev-files');
  } finally {
    loading.value = false;
  }
}

function onSelect(id: string): void {
  // UiTree 的目录节点也会触发 select；只有真实文件才转发 open。
  if (!files.value.includes(id)) return;
  emit('open', id);
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
  <div class="file-nav">
    <div v-if="loading" class="file-nav__state">
      <UiSpinner :size="14" label="正在读文件列表" />
      <span>正在读文件列表…</span>
    </div>

    <UiEmpty
      v-else-if="!session.siteDir"
      class="file-nav__empty"
      :icon="icons.files"
      title="还没打开站点"
      description="打开站点后，这里会列出可以编辑的源码文件。"
    />

    <UiEmpty
      v-else-if="error"
      class="file-nav__empty"
      :icon="icons.alert"
      title="读不到文件列表"
      :description="error"
    >
      <template #action>
        <UiButton size="sm" :icon-left="icons.refresh" @click="load">重试</UiButton>
      </template>
    </UiEmpty>

    <UiEmpty
      v-else-if="!nodes.length"
      class="file-nav__empty"
      :icon="icons.files"
      title="没有可编辑的源码文件"
      description="站点里还没有源码文件；先建一篇文章或页面，再回来看看。"
    />

    <div v-else class="file-nav__tree">
      <UiTree
        :nodes="nodes"
        :model-value="props.active"
        :default-expanded="expanded"
        @select="onSelect"
      />
    </div>

    <p v-if="nodes.length && !loading" class="file-nav__foot">
      共 {{ files.length }} 个文件 · 点文件在「代码」页签打开
    </p>
  </div>
</template>

<style scoped>
.file-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

.file-nav__state {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s3);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.file-nav__tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.file-nav__empty {
  flex: 1;
  min-height: 0;
}

.file-nav__foot {
  flex: none;
  margin: 0;
  padding: var(--ui-s1) var(--ui-s3);
  overflow: hidden;
  border-top: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
