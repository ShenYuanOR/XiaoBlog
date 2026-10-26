<script setup lang="ts">
import { computed, inject, onMounted, ref, watch, type Reactive } from 'vue';
import HtmlBlocks from './HtmlBlocks.vue';

export interface HtmlBlockNode {
  id: string;
  name: string;
  kind: string;
  text: string;
  locked: boolean;
  children: HtmlBlockNode[];
}

const props = defineProps<{
  node: HtmlBlockNode;
  index: number;
  parentId: string;
  parentName: string;
  selectedId: string;
  catalog: { name: string; label: string; category?: string }[];
}>();

const emit = defineEmits<{
  select: [id: string];
  text: [payload: { id: string; text: string }];
  insert: [payload: { parentId: string; parentName: string; index: number; name: string }];
  move: [payload: { id: string; parentId: string; parentName: string; index: number }];
  remove: [id: string];
  duplicate: [id: string];
}>();

interface BlockSession {
  drag: {
    id: string;
    overId: string;
    place: 'before' | 'after' | 'into';
    parentId: string;
    parentName: string;
    index: number;
    center: boolean;
  };
  menu: {
    open: boolean;
    parentId: string;
    parentName: string;
    index: number;
    x: number;
    y: number;
    query: string;
    replaceId: string;
  };
  startDrag: (id: string) => void;
  openMenu: (
    x: number,
    y: number,
    parentId: string,
    parentName: string,
    index: number,
    query?: string,
    replaceId?: string,
  ) => void;
}

const session = inject<Reactive<BlockSession>>('htmlBlocks');
const textEl = ref<HTMLElement | null>(null);
const editing = ref(false);
const moreOpen = ref(false);
const blockLabel = computed(() => {
  const hit = props.catalog.find((item) => item.name === props.node.name);
  if (hit) return hit.label;
  if (props.node.name === 'article' || props.node.name === 'Section' || props.node.name === 'div') return '组';
  if (props.node.kind === 'text') return '段落';
  return props.node.name;
});

const TEXT_NAMES = new Set([
  'Text',
  'Heading',
  'Quote',
  'Badge',
  'Button',
  'Link',
  'p',
  'h1',
  'h2',
  'h3',
  'span',
]);

function isContainer(node: HtmlBlockNode): boolean {
  if (node.kind === 'text' || node.locked || TEXT_NAMES.has(node.name)) return false;
  return true;
}

function leafText(node: HtmlBlockNode): string | null {
  if (node.kind === 'text') return node.text;
  if (node.children.some((child) => child.kind !== 'text')) return null;
  return node.children.map((child) => child.text).join('') || node.text;
}

function showChildren(node: HtmlBlockNode): boolean {
  return leafText(node) === null && node.children.length > 0;
}

function paintText(value: string | null): void {
  if (!textEl.value || editing.value || value === null) return;
  if (textEl.value.innerText !== value) textEl.value.innerText = value;
}

onMounted(() => paintText(leafText(props.node)));
watch(
  () => leafText(props.node),
  (value) => paintText(value),
);

function onTextInput(): void {
  const value = textEl.value?.innerText.replace(/\n+$/g, '') ?? '';
  if (!value.startsWith('/')) {
    if (session) session.menu.open = false;
    return;
  }
  const query = value.slice(1).trim();
  const rect = textEl.value?.getBoundingClientRect();
  session?.openMenu(rect?.left ?? 0, (rect?.bottom ?? 0) + 4, props.parentId, props.parentName, props.index, query, props.node.id);
}

function onTextBlur(): void {
  editing.value = false;
  const text = textEl.value?.innerText.replace(/\n+$/g, '') ?? '';
  if (text.startsWith('/')) return;
  emit('text', { id: props.node.id, text });
}

function onTextKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    emit('text', { id: props.node.id, text: textEl.value?.innerText.replace(/\n+$/g, '') ?? '' });
    if (props.parentId) {
      emit('insert', {
        parentId: props.parentId,
        parentName: props.parentName,
        index: props.index + 1,
        name: 'Text',
      });
    }
    return;
  }
  if (event.key === 'Backspace') {
    const text = textEl.value?.innerText.replace(/\n+$/g, '') ?? '';
    if (text.length === 0) {
      event.preventDefault();
      emit('remove', props.node.id);
    }
  }
  if (event.key === 'Escape') {
    session && (session.menu.open = false);
  }
}

function moveBy(step: number): void {
  if (!props.parentId) return;
  const next = props.index + step;
  if (next < 0) return;
  emit('move', {
    id: props.node.id,
    parentId: props.parentId,
    parentName: props.parentName,
    index: next,
  });
}
</script>

<template>
  <article
    class="hblock"
    :class="[
      `is-${node.name.toLowerCase()}`,
      {
        'is-selected': selectedId === node.id,
        'is-over': session?.drag.overId === node.id,
        'is-container': isContainer(node),
      },
    ]"
    :data-block-id="node.id"
    :data-block-name="node.name"
    :data-parent-id="parentId"
    :data-parent-name="parentName"
    :data-index="index"
    :data-container="isContainer(node) ? '1' : '0'"
    :data-child-count="node.children.length"
    @click.stop="emit('select', node.id)"
  >
    <div v-if="parentId" class="in-between">
      <button
        type="button"
        class="in-between-plus"
        aria-label="在这块前面插入"
        @click.stop="session?.openMenu($event.clientX, $event.clientY, parentId, parentName, index)"
      >
        +
      </button>
    </div>
    <div v-if="session?.drag.overId === node.id && session.drag.place === 'before'" class="drop-line"></div>
    <div v-if="selectedId === node.id" class="block-toolbar" @click.stop>
      <button type="button" class="tool drag" aria-label="拖动" @pointerdown="session?.startDrag(node.id)">
        ⋮⋮
      </button>
      <span class="tool-name">{{ blockLabel }}</span>
      <button type="button" class="tool" aria-label="上移" @click="moveBy(-1)">↑</button>
      <button type="button" class="tool" aria-label="下移" @click="moveBy(1)">↓</button>
      <button type="button" class="tool" aria-label="更多" @click="moreOpen = !moreOpen">⋯</button>
      <div v-if="moreOpen" class="more-menu">
        <button type="button" @click="emit('duplicate', node.id); moreOpen = false">复制</button>
        <button
          v-if="parentId"
          type="button"
          @click="session?.openMenu($event.clientX, $event.clientY, parentId, parentName, index); moreOpen = false"
        >
          在前面插入
        </button>
        <button
          v-if="parentId"
          type="button"
          @click="session?.openMenu($event.clientX, $event.clientY, parentId, parentName, index + 1); moreOpen = false"
        >
          在后面插入
        </button>
        <button type="button" class="danger" @click="emit('remove', node.id); moreOpen = false">删除</button>
      </div>
    </div>
    <div
      v-if="leafText(node) !== null"
      ref="textEl"
      class="hblock-text"
      contenteditable="plaintext-only"
      spellcheck="false"
      role="textbox"
      data-placeholder="输入 / 选择区块"
      @focus="editing = true"
      @blur="onTextBlur"
      @input="onTextInput"
      @keydown="onTextKeydown"
      @click.stop="emit('select', node.id)"
    ></div>
    <HtmlBlocks
      v-else-if="showChildren(node)"
      :nodes="node.children"
      :parent-id="node.id"
      :parent-name="node.name"
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
      v-if="isContainer(node) && selectedId === node.id"
      type="button"
      class="insert-slot"
      @click.stop="session?.openMenu($event.clientX, $event.clientY, node.id, node.name, node.children.length)"
    >
      + 添加区块
    </button>
    <div v-if="session?.drag.overId === node.id && session.drag.place !== 'before'" class="drop-line"></div>
  </article>
</template>

<style scoped>
.hblock {
  position: relative;
  margin: 0;
  padding: 2px 0;
  border-radius: 2px;
}

.hblock:hover {
  outline: 1px solid rgb(56 88 233 / 35%);
}

.hblock.is-selected {
  outline: 1px solid #3858e9;
}

.hblock.is-container:not(.is-selected) {
  outline: none;
  padding: 0;
}

.in-between {
  position: relative;
  height: 14px;
  margin: 0 -8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.in-between::before {
  content: '';
  position: absolute;
  right: 0;
  left: 0;
  height: 2px;
  background: transparent;
}

.in-between:hover::before,
.in-between:focus-within::before {
  background: #3858e9;
}

.in-between-plus {
  position: relative;
  z-index: 2;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 50%;
  background: #3858e9;
  color: #fff;
  font-size: 18px;
  line-height: 24px;
  opacity: 0;
  cursor: pointer;
}

.in-between:hover .in-between-plus,
.in-between:focus-within .in-between-plus {
  opacity: 1;
}

.block-toolbar {
  position: absolute;
  left: 0;
  top: -42px;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 2px;
  height: 36px;
  padding: 0 4px;
  border-radius: 2px;
  background: #1e1e1e;
  color: #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 28%);
}

.more-menu {
  position: absolute;
  top: 40px;
  right: 0;
  z-index: 7;
  width: 160px;
  padding: 6px;
  border-radius: 2px;
  background: #fff;
  color: #1e1e1e;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.more-menu button {
  display: block;
  width: 100%;
  height: 32px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  text-align: left;
  padding: 0 8px;
  cursor: pointer;
}

.more-menu button:hover {
  background: #f0f0f0;
}

.more-menu .danger {
  color: #cc1818;
}

.tool {
  height: 26px;
  min-width: 26px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: #fff;
  cursor: pointer;
}

.tool:hover {
  background: #3a3a3a;
}

.tool-plus {
  background: var(--ui-accent);
}

.tool-name {
  padding: 0 6px;
  font-size: 12px;
  color: #ddd;
}

.hblock-text {
  min-height: 1.6em;
  outline: none;
  color: #1e1e1e;
  font-family: Georgia, 'Songti SC', serif;
  font-size: 18px;
  line-height: 1.8;
}

.hblock-text:empty::before {
  content: attr(data-placeholder);
  color: #949494;
}

.is-heading .hblock-text {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.25;
}

.is-quote {
  border-left: 3px solid var(--ui-line-2);
  padding-left: 12px;
}

.is-callout,
.is-card {
  border: 1px solid var(--ui-line);
  border-radius: 8px;
  padding: 12px;
}

.insert-slot {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed var(--ui-line-2);
  border-radius: 2px;
  background: transparent;
  color: var(--ui-text-3);
  cursor: pointer;
}

.drop-line {
  height: 3px;
  margin: 4px 0;
  border-radius: 2px;
  background: var(--ui-accent);
}
</style>
