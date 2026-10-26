<script setup lang="ts">
import { computed, onBeforeUnmount, provide, reactive, ref } from 'vue';
import HtmlBlock, { type HtmlBlockNode } from './HtmlBlock.vue';

defineOptions({ name: 'HtmlBlocks' });

const props = withDefaults(
  defineProps<{
    nodes: HtmlBlockNode[];
    parentId?: string;
    parentName?: string;
    selectedId?: string;
    catalog?: { name: string; label: string; category?: string }[];
    root?: boolean;
  }>(),
  {
    parentId: '',
    parentName: '',
    selectedId: '',
    catalog: () => [],
    root: false,
  },
);

const emit = defineEmits<{
  select: [id: string];
  text: [payload: { id: string; text: string }];
  insert: [payload: { parentId: string; parentName: string; index: number; name: string }];
  move: [payload: { id: string; parentId: string; parentName: string; index: number }];
  remove: [id: string];
  duplicate: [id: string];
  replace: [payload: { id: string; parentId: string; parentName: string; index: number; name: string }];
}>();

const session = reactive({
  drag: {
    id: '',
    overId: '',
    place: 'after' as 'before' | 'after' | 'into',
    parentId: '',
    parentName: '',
    index: 0,
    center: false,
  },
  menu: {
    open: false,
    parentId: '',
    parentName: '',
    index: 0,
    x: 0,
    y: 0,
    query: '',
    replaceId: '',
  },
  startDrag(id: string) {
    session.drag.id = id;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  },
  openMenu(
    x: number,
    y: number,
    parentId: string,
    parentName: string,
    index: number,
    query = '',
    replaceId = '',
  ) {
    session.menu.open = true;
    session.menu.x = x;
    session.menu.y = y;
    session.menu.parentId = parentId;
    session.menu.parentName = parentName;
    session.menu.index = index;
    session.menu.query = query;
    session.menu.replaceId = replaceId;
  },
});

if (props.root) provide('htmlBlocks', session);

const inserterOpen = ref(false);
const listOpen = ref(false);

const filtered = computed(() => {
  const query = session.menu.query.trim().toLowerCase();
  return props.catalog.filter(
    (item) =>
      !query ||
      item.label.toLowerCase().includes(query) ||
      item.name.toLowerCase().includes(query),
  );
});

const GROUP_LABEL: Record<string, string> = {
  content: '文本',
  structure: '设计',
  container: '设计',
  embed: '媒体',
};

const grouped = computed(() => {
  const order = ['文本', '媒体', '设计'];
  const buckets = new Map<string, { name: string; label: string; category?: string }[]>();
  for (const item of filtered.value) {
    const title = GROUP_LABEL[item.category ?? 'content'] ?? '文本';
    const list = buckets.get(title) ?? [];
    list.push(item);
    buckets.set(title, list);
  }
  return order
    .filter((title) => buckets.has(title))
    .map((title) => ({ title, items: buckets.get(title) ?? [] }));
});

function labelOf(name: string): string {
  return props.catalog.find((item) => item.name === name)?.label ?? (name === 'article' ? '组' : name);
}

function listRows(
  nodes: HtmlBlockNode[],
  depth = 0,
): { id: string; label: string; depth: number }[] {
  const rows: { id: string; label: string; depth: number }[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') continue;
    rows.push({ id: node.id, label: labelOf(node.name), depth });
    rows.push(...listRows(node.children, depth + 1));
  }
  return rows;
}

const outlineRows = computed(() => (props.root ? listRows(props.nodes) : []));

function trail(nodes: HtmlBlockNode[], id: string, acc: string[] = []): string[] | null {
  for (const node of nodes) {
    const next = [...acc, labelOf(node.name)];
    if (node.id === id) return next;
    const nested = trail(node.children, id, next);
    if (nested) return nested;
  }
  return null;
}

const breadcrumb = computed(() => {
  if (!props.root || !props.selectedId) return '文档';
  return ['文档', ...(trail(props.nodes, props.selectedId) ?? [])].join(' › ');
});

const appendTarget = computed(() => {
  const container = props.nodes.find((node) => node.kind !== 'text' && node.children.length >= 0 && node.name !== 'Text' && node.name !== 'Heading');
  if (!container) return null;
  return { parentId: container.id, parentName: container.name, index: container.children.length };
});

function toggleInserter(): void {
  inserterOpen.value = !inserterOpen.value;
  if (!inserterOpen.value || !appendTarget.value) return;
  session.menu.parentId = appendTarget.value.parentId;
  session.menu.parentName = appendTarget.value.parentName;
  session.menu.index = appendTarget.value.index;
  session.menu.replaceId = '';
  session.menu.query = '';
  session.menu.open = false;
}

function choose(name: string): void {
  if (session.menu.replaceId) {
    emit('replace', {
      id: session.menu.replaceId,
      parentId: session.menu.parentId,
      parentName: session.menu.parentName,
      index: session.menu.index,
      name,
    });
  } else {
    emit('insert', {
      parentId: session.menu.parentId,
      parentName: session.menu.parentName,
      index: session.menu.index,
      name,
    });
  }
  session.menu.open = false;
  session.menu.replaceId = '';
}

function blockFromPoint(x: number, y: number): HTMLElement | null {
  const hit = document.elementFromPoint(x, y);
  const block = hit?.closest<HTMLElement>('[data-block-id]');
  if (!block || block.dataset.blockId === session.drag.id) return null;
  return block;
}

function onDragMove(event: PointerEvent): void {
  const host = document.querySelector('.html-editor');
  const hostRect = host?.getBoundingClientRect();
  session.drag.center = Boolean(
    hostRect && Math.abs(event.clientX - (hostRect.left + hostRect.width / 2)) < 28,
  );
  const block = blockFromPoint(event.clientX, event.clientY);
  if (!block) {
    session.drag.overId = '';
    return;
  }
  const rect = block.getBoundingClientRect();
  const relY = (event.clientY - rect.top) / Math.max(1, rect.height);
  session.drag.overId = block.dataset.blockId ?? '';
  session.drag.parentId = block.dataset.parentId ?? '';
  session.drag.parentName = block.dataset.parentName ?? '';
  const index = Number(block.dataset.index ?? '0');
  const container = block.dataset.container === '1';
  if (container && session.drag.center && relY > 0.25 && relY < 0.75) {
    session.drag.place = 'into';
    session.drag.parentId = session.drag.overId;
    session.drag.parentName = block.dataset.blockName ?? '';
    session.drag.index = Number(block.dataset.childCount ?? '0');
    return;
  }
  session.drag.place = relY < 0.5 ? 'before' : 'after';
  session.drag.index = session.drag.place === 'before' ? index : index + 1;
}

function onDragEnd(): void {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  if (session.drag.id && session.drag.parentId) {
    emit('move', {
      id: session.drag.id,
      parentId: session.drag.parentId,
      parentName: session.drag.parentName,
      index: session.drag.index,
    });
  }
  session.drag.id = '';
  session.drag.overId = '';
  session.drag.center = false;
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
});
</script>

<template>
  <div class="html-editor" :class="{ 'is-root': root, 'show-inserter': root && inserterOpen, 'show-list': root && listOpen }" @click.self="session.menu.open = false">
    <header v-if="root" class="editor-top">
      <button type="button" class="wp-plus" :class="{ on: inserterOpen }" aria-label="区块插入器" @click="toggleInserter">
        +
      </button>
      <button type="button" class="wp-list" :class="{ on: listOpen }" aria-label="列表视图" @click="listOpen = !listOpen">
        列表
      </button>
      <p class="crumb">{{ breadcrumb }}</p>
    </header>
    <div class="editor-body">
      <aside v-if="root && inserterOpen" class="inserter" aria-label="区块插入器">
        <input v-model="session.menu.query" class="inserter-search" placeholder="搜索区块" aria-label="搜索区块" />
        <section v-for="group in grouped" :key="group.title">
          <h3>{{ group.title }}</h3>
          <div class="inserter-grid">
            <button
              v-for="item in group.items"
              :key="item.name"
              type="button"
              @click="choose(item.name)"
            >
              <span class="inserter-icon">{{ item.label.slice(0, 1) }}</span>
              {{ item.label }}
            </button>
          </div>
        </section>
      </aside>
      <aside v-if="root && listOpen" class="list-view" aria-label="列表视图">
        <button
          v-for="row in outlineRows"
          :key="row.id"
          type="button"
          :class="{ on: row.id === selectedId }"
          :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
          @click="emit('select', row.id)"
        >
          {{ row.label }}
        </button>
      </aside>
      <div :class="{ paper: root }">
    <div v-if="root && session.drag.center" class="center-guide" aria-hidden="true"></div>
    <HtmlBlock
      v-for="(node, index) in nodes"
      :key="node.id"
      :node="node"
      :index="index"
      :parent-id="parentId"
      :parent-name="parentName"
      :selected-id="selectedId"
      :catalog="catalog"
      @select="emit('select', $event)"
      @text="emit('text', $event)"
      @insert="emit('insert', $event)"
      @move="emit('move', $event)"
      @remove="emit('remove', $event)"
      @duplicate="emit('duplicate', $event)"
    />
    <button
      v-if="root && appendTarget"
      type="button"
      class="appender"
      @click.stop="
        session.openMenu($event.clientX, $event.clientY, appendTarget.parentId, appendTarget.parentName, appendTarget.index)
      "
    >
      输入 / 来选择一个区块
    </button>
      </div>
    </div>
    <div
      v-if="root && session.menu.open"
      class="block-menu"
      :style="{ left: `${session.menu.x}px`, top: `${session.menu.y}px` }"
      @click.stop
    >
      <p class="menu-title">{{ session.menu.query ? `/${session.menu.query}` : '区块' }}</p>
      <template v-for="group in grouped" :key="group.title">
        <p class="menu-group">{{ group.title }}</p>
        <button v-for="item in group.items" :key="item.name" type="button" @click="choose(item.name)">
          <span class="inserter-icon">{{ item.label.slice(0, 1) }}</span>
          {{ item.label }}
        </button>
      </template>
      <p v-if="filtered.length === 0" class="menu-empty">没有匹配的区块</p>
    </div>
  </div>
</template>

<style scoped>
.html-editor:not(.is-root),
.html-editor:not(.is-root) .editor-body {
  display: block;
  height: auto;
  background: transparent;
}

.html-editor.is-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f0f0f0;
  color: #1e1e1e;
}

.editor-top {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 8px;
  border-bottom: 1px solid #ddd;
  background: #fff;
}

.wp-plus,
.wp-list {
  height: 32px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: #1e1e1e;
  cursor: pointer;
}

.wp-plus {
  width: 32px;
  background: #3858e9;
  color: #fff;
  font-size: 22px;
  line-height: 32px;
}

.wp-plus.on,
.wp-list.on {
  outline: 2px solid #3858e9;
}

.crumb {
  margin: 0;
  color: #50575e;
  font-size: 13px;
}

.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.inserter,
.list-view {
  flex: none;
  width: 320px;
  overflow: auto;
  border-right: 1px solid #ddd;
  background: #fff;
  padding: 12px;
}

.inserter-search {
  width: 100%;
  height: 36px;
  margin-bottom: 12px;
  padding: 0 8px;
  border: 1px solid #949494;
  border-radius: 2px;
}

.inserter h3,
.menu-group {
  margin: 8px 0;
  color: #1e1e1e;
  font-size: 13px;
}

.inserter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.inserter-grid button,
.list-view button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: #1e1e1e;
  text-align: left;
  cursor: pointer;
}

.inserter-grid button:hover,
.list-view button:hover,
.list-view button.on {
  background: #f0f0f0;
}

.inserter-icon {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid #ddd;
  border-radius: 2px;
  background: #fff;
  font-size: 12px;
}

.paper {
  position: relative;
  flex: 1;
  overflow: auto;
  padding: 36px 0 120px;
}

.paper :deep(.hblock),
.appender {
  max-width: 650px;
  margin-right: auto;
  margin-left: auto;
}

.appender {
  display: block;
  margin-top: 12px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #949494;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 18px;
  text-align: left;
  cursor: text;
}

.center-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 0;
  border-left: 1px dashed #e3b341;
  pointer-events: none;
}

.block-menu {
  position: fixed;
  z-index: 40;
  width: 240px;
  max-height: 320px;
  overflow: auto;
  padding: 6px;
  border-radius: 4px;
  background: #fff;
  color: #1e1e1e;
  box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
}

.menu-title,
.menu-empty {
  margin: 0;
  padding: 6px 8px;
  color: #757575;
  font-size: 12px;
}

.block-menu button {
  display: block;
  width: 100%;
  height: 36px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: #1e1e1e;
  text-align: left;
  padding: 0 8px;
  cursor: pointer;
}

.block-menu button:hover {
  background: #f0f0f0;
}
</style>
