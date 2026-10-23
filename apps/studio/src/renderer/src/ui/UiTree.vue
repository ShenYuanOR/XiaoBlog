<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
import UiBadge from './UiBadge.vue';
import UiIcon from './UiIcon.vue';

interface TreeNode {
  id: string;
  label: string;
  icon?: string;
  badge?: string;
  children?: TreeNode[];
}

interface FlatRow {
  node: TreeNode;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  isExpanded: boolean;
}

const props = withDefaults(
  defineProps<{
    nodes: TreeNode[];
    /** 选中节点 id（可选，配合 v-model 使用）。 */
    modelValue?: string;
    /** 初始展开的节点 id。 */
    defaultExpanded?: string[];
    /** 每层缩进像素。 */
    indent?: number;
  }>(),
  { modelValue: undefined, defaultExpanded: () => [], indent: 12 },
);

const emit = defineEmits<{
  'update:modelValue': [id: string];
  select: [id: string, node: TreeNode];
  toggle: [id: string, expanded: boolean];
  'update:expanded': [ids: string[]];
}>();

const uid = useId();
const treeRef = ref<HTMLDivElement | null>(null);
const expanded = ref<string[]>([...props.defaultExpanded]);
const activeIndex = ref(0);
const focused = ref(false);

const rows = computed<FlatRow[]>(() => {
  const out: FlatRow[] = [];
  const walk = (nodes: TreeNode[], depth: number, parentId: string | null): void => {
    for (const node of nodes) {
      const children = node.children ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = expanded.value.includes(node.id);
      out.push({ node, depth, parentId, hasChildren, isExpanded });
      if (hasChildren && isExpanded) walk(children, depth + 1, node.id);
    }
  };
  walk(props.nodes, 0, null);
  return out;
});

watch(
  () => rows.value.length,
  (length) => {
    if (activeIndex.value > length - 1) activeIndex.value = Math.max(0, length - 1);
  },
);

function rowId(index: number): string {
  return `${uid}-row-${index}`;
}

function toggleNode(id: string): void {
  const next = expanded.value.includes(id)
    ? expanded.value.filter((item) => item !== id)
    : [...expanded.value, id];
  expanded.value = next;
  emit('toggle', id, next.includes(id));
  emit('update:expanded', [...next]);
}

function selectRow(row: FlatRow, index: number): void {
  activeIndex.value = index;
  emit('update:modelValue', row.node.id);
  emit('select', row.node.id, row.node);
}

function onRowClick(row: FlatRow, index: number): void {
  treeRef.value?.focus();
  selectRow(row, index);
}

function onRowDoubleClick(row: FlatRow): void {
  if (row.hasChildren) toggleNode(row.node.id);
}

async function setActive(index: number): Promise<void> {
  activeIndex.value = index;
  await nextTick();
  treeRef.value
    ?.querySelector<HTMLElement>(`[data-tree-index="${index}"]`)
    ?.scrollIntoView({ block: 'nearest' });
}

function onKeydown(event: KeyboardEvent): void {
  const list = rows.value;
  const last = list.length - 1;
  if (last < 0) return;
  const current = list[activeIndex.value] ?? list[0];
  if (!current) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    void setActive(Math.min(last, activeIndex.value + 1));
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    void setActive(Math.max(0, activeIndex.value - 1));
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (current.hasChildren && !current.isExpanded) toggleNode(current.node.id);
    else if (current.hasChildren) void setActive(Math.min(last, activeIndex.value + 1));
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (current.hasChildren && current.isExpanded) {
      toggleNode(current.node.id);
    } else if (current.parentId) {
      const parentIndex = list.findIndex((row) => row.node.id === current.parentId);
      if (parentIndex >= 0) void setActive(parentIndex);
    }
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    void setActive(0);
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    void setActive(last);
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectRow(current, activeIndex.value);
  }
}
</script>

<template>
  <div
    ref="treeRef"
    class="ui-tree"
    role="tree"
    tabindex="0"
    :aria-activedescendant="focused ? rowId(activeIndex) : undefined"
    @keydown="onKeydown"
    @focusin="focused = true"
    @focusout="focused = false"
  >
    <div
      v-for="(row, index) in rows"
      :id="rowId(index)"
      :key="row.node.id"
      class="ui-tree__row"
      :class="{ 'is-selected': row.node.id === modelValue, 'is-active': index === activeIndex }"
      :style="{ paddingLeft: `calc(var(--ui-s1) + ${indent * row.depth}px)` }"
      :data-tree-index="index"
      role="treeitem"
      :aria-level="row.depth + 1"
      :aria-selected="row.node.id === modelValue"
      :aria-expanded="row.hasChildren ? row.isExpanded : undefined"
      @click="onRowClick(row, index)"
      @dblclick="onRowDoubleClick(row)"
    >
      <button
        v-if="row.hasChildren"
        type="button"
        class="ui-tree__caret"
        tabindex="-1"
        :aria-label="row.isExpanded ? '收起' : '展开'"
        @click.stop="toggleNode(row.node.id)"
        @dblclick.stop
      >
        <UiIcon :path="row.isExpanded ? mdiChevronDown : mdiChevronRight" :size="14" />
      </button>
      <span v-else class="ui-tree__caret-space" aria-hidden="true"></span>
      <UiIcon v-if="row.node.icon" class="ui-tree__icon" :path="row.node.icon" :size="16" />
      <span class="ui-tree__label">{{ row.node.label }}</span>
      <UiBadge v-if="row.node.badge" tone="accent">{{ row.node.badge }}</UiBadge>
    </div>
  </div>
</template>

<style scoped>
.ui-tree {
  min-width: 0;
  padding: var(--ui-s1);
  overflow: auto;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  outline: none;
}

.ui-tree__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  height: var(--ui-h-sm);
  padding-right: var(--ui-s3);
  border-radius: var(--ui-r-sm);
  cursor: pointer;
  user-select: none;
  transition: background var(--ui-dur) var(--ui-ease);
}

.ui-tree__row:hover {
  background: var(--ui-hover);
}

.ui-tree__row.is-selected {
  background: var(--ui-active);
  color: var(--ui-text);
}

.ui-tree__row.is-active {
  box-shadow: inset 0 0 0 1px var(--ui-line-2);
}

.ui-tree__caret {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ui-s5);
  height: var(--ui-s5);
  padding: 0;
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-3);
  cursor: pointer;
}

.ui-tree__caret:hover {
  color: var(--ui-text);
  background: var(--ui-hover);
}

.ui-tree__caret-space {
  flex: none;
  width: var(--ui-s5);
}

.ui-tree__icon {
  flex: none;
  color: var(--ui-text-3);
}

.ui-tree__row.is-selected .ui-tree__icon {
  color: var(--ui-accent);
}

.ui-tree__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-tree__row.is-selected .ui-tree__label {
  color: var(--ui-text);
}
</style>
