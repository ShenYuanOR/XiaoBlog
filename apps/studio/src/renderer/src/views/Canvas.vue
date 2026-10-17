<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { CanvasField, CanvasNode } from '../env.d.ts';
import { useSession } from '../stores/session.ts';

interface Row {
  id: string;
  name: string;
  locked: boolean;
  depth: number;
  parentId: string | null;
  parentName: string;
  index: number;
  childCount: number;
}

const session = useSession();
const names = ref<string[]>([]);
const tree = ref<CanvasNode[]>([]);
const selected = ref('');
const fields = ref<CanvasField[]>([]);
const values = ref<Record<string, string>>({});
const message = ref('');
const mark = ref<{ id: string; place: 'before' | 'after' | 'inside' } | null>(null);
const nestCache = new Map<string, boolean>();

function rowsOf(
  nodes: CanvasNode[],
  depth = 0,
  parentId: string | null = null,
  parentName = '',
): Row[] {
  return nodes.flatMap((node, index) => [
    {
      id: node.id,
      name: node.name,
      locked: node.locked,
      depth,
      parentId,
      parentName,
      index,
      childCount: node.children.length,
    },
    ...rowsOf(node.children, depth + 1, node.id, node.name),
  ]);
}

const rows = computed(() => rowsOf(tree.value));

function nestKnown(parent: string, child: string): boolean | null {
  const key = `${parent}>${child}`;
  if (nestCache.has(key)) return nestCache.get(key) ?? false;
  void window.xiao.canvas.canNest(parent, child).then((result) => {
    nestCache.set(key, result.ok ? result.data : false);
  });
  return null;
}

function pathOf(nodes: CanvasNode[], id: string, acc: number[] = []): number[] | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;
    if (node.id === id) return [...acc, index];
    const nested = pathOf(node.children, id, [...acc, index]);
    if (nested) return nested;
  }
  return null;
}

function at(nodes: CanvasNode[], path: number[]): CanvasNode | undefined {
  let level = nodes;
  let node: CanvasNode | undefined;
  for (const index of path) {
    node = level[index];
    if (!node) return undefined;
    level = node.children;
  }
  return node;
}

async function show(node: CanvasNode | undefined): Promise<void> {
  if (!node || node.locked) {
    fields.value = [];
    values.value = {};
    return;
  }
  selected.value = node.id;
  const listed = await window.xiao.canvas.props(node.name);
  fields.value = listed.ok ? listed.data : [];
  values.value = Object.fromEntries(node.props.map((prop) => [prop.name, prop.value]));
}

async function load(keep?: number[] | null): Promise<void> {
  if (!session.siteDir) return;
  const listed = await window.xiao.canvas.components();
  const outline = await window.xiao.canvas.outline(session.siteDir, session.pageFile);
  names.value = listed.ok ? listed.data : [];
  tree.value = outline.ok ? outline.data : [];
  message.value = outline.ok
    ? message.value
    : outline.message.includes('解析')
      ? '源码有错误，修复后恢复'
      : outline.message;
  if (keep) await show(at(tree.value, keep));
}

async function select(id: string, fromPreview = false): Promise<void> {
  selected.value = id;
  await show(at(tree.value, pathOf(tree.value, id) ?? []));
  if (!fromPreview) await window.xiao.preview.focus(session.pageFile, id);
}

async function history(kind: 'undo' | 'redo'): Promise<void> {
  if (!session.siteDir) return;
  const result =
    kind === 'undo'
      ? await window.xiao.canvas.undo(session.siteDir, session.pageFile)
      : await window.xiao.canvas.redo(session.siteDir, session.pageFile);
  message.value = result.ok ? (kind === 'undo' ? '已撤销' : '已重做') : result.message;
  await load();
}

async function add(name: string): Promise<void> {
  const parent = selected.value || tree.value[0]?.id;
  if (!session.siteDir || !parent) return;
  const keep = pathOf(tree.value, parent);
  const result = await window.xiao.canvas.insert(session.siteDir, parent, 0, name, session.pageFile);
  message.value = result.ok ? `已放入 ${name}` : result.message;
  if (!result.ok || !keep) {
    await load(keep);
    return;
  }
  await load(keep);
  const parentNode = at(tree.value, keep);
  const child = parentNode?.children[0];
  if (child) await show(child);
}

function fieldValue(event: Event): string {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    return target.checked ? 'true' : 'false';
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return target.value;
  return '';
}

async function write(field: CanvasField, event: Event): Promise<void> {
  if (!session.siteDir || !selected.value) return;
  const keep = pathOf(tree.value, selected.value);
  const raw = fieldValue(event);
  const value = field.type === 'boolean' ? raw === 'true' : field.type === 'number' ? Number(raw) : raw;
  const result = await window.xiao.canvas.setProp(
    session.siteDir,
    selected.value,
    field.name,
    value,
    session.pageFile,
  );
  message.value = result.ok ? `已改 ${field.label}` : result.message;
  values.value = { ...values.value, [field.name]: raw };
  await load(keep);
}

function startNew(name: string, event: DragEvent): void {
  session.setDrag({ kind: 'new', name, id: '' });
  event.dataTransfer?.setData('text/plain', name);
}

function startMove(row: Row, event: DragEvent): void {
  session.setDrag({ kind: 'move', name: row.name, id: row.id });
  event.dataTransfer?.setData('text/plain', row.id);
}

function targetOf(row: Row, place: 'before' | 'after' | 'inside'): { parentId: string; index: number; parentName: string } | null {
  if (place === 'inside') {
    if (row.locked) return null;
    return { parentId: row.id, index: row.childCount, parentName: row.name };
  }
  if (!row.parentId) return null;
  return {
    parentId: row.parentId,
    index: place === 'before' ? row.index : row.index + 1,
    parentName: row.parentName,
  };
}

function over(row: Row, event: DragEvent): void {
  const drag = session.drag;
  if (!drag) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = rect.height === 0 ? 0.5 : (event.clientY - rect.top) / rect.height;
  const place = !row.parentId ? 'inside' : ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside';
  const target = targetOf(row, place);
  if (!target || (drag.kind === 'move' && drag.id === target.parentId)) {
    mark.value = null;
    return;
  }
  const allowed = nestKnown(target.parentName, drag.name);
  if (allowed === false) {
    mark.value = null;
    return;
  }
  event.preventDefault();
  mark.value = { id: row.id, place };
}

async function drop(row: Row, event: DragEvent): Promise<void> {
  const drag = session.drag;
  const place = mark.value?.id === row.id ? mark.value.place : null;
  mark.value = null;
  session.setDrag(null);
  if (!drag || !place || !session.siteDir) return;
  event.preventDefault();
  const target = targetOf(row, place);
  if (!target) return;
  const result =
    drag.kind === 'new'
      ? await window.xiao.canvas.insert(
          session.siteDir,
          target.parentId,
          target.index,
          drag.name,
          session.pageFile,
        )
      : await window.xiao.canvas.move(
          session.siteDir,
          drag.id,
          target.parentId,
          target.index,
          session.pageFile,
        );
  message.value = result.ok ? (drag.kind === 'new' ? `已放入 ${drag.name}` : '已移动') : result.message;
  await load();
}

function onRefresh(event: Event): void {
  const detail = (event as CustomEvent<string>).detail;
  if (detail) message.value = detail;
  void load();
}

watch(
  () => session.pageFile,
  () => void load(),
);

let stopPick = (): void => undefined;
onMounted(() => {
  window.addEventListener('xiao-canvas', onRefresh);
  stopPick = window.xiao.preview.onPick((payload) => {
    if (payload.file.replaceAll('\\', '/') !== session.pageFile) return;
    void select(payload.offset, true);
  });
  void load();
});
onUnmounted(() => {
  window.removeEventListener('xiao-canvas', onRefresh);
  stopPick();
});
</script>

<template>
  <div class="canvas">
    <aside>
      <button
        v-for="name in names"
        :key="name"
        type="button"
        draggable="true"
        @dragstart="startNew(name, $event)"
        @dragend="session.setDrag(null)"
        @click="add(name)"
      >
        {{ name }}
      </button>
    </aside>
    <div>
      <p>
        <button type="button" @click="history('undo')">撤销</button>
        <button type="button" @click="history('redo')">重做</button>
      </p>
      <p v-if="message">{{ message }}</p>
      <ul>
        <li
          v-for="row in rows"
          :key="row.id"
          :class="mark?.id === row.id ? mark.place : ''"
          @dragover="over(row, $event)"
          @drop="drop(row, $event)"
        >
          <button
            type="button"
            draggable="true"
            :aria-pressed="selected === row.id"
            @dragstart="startMove(row, $event)"
            @dragend="session.setDrag(null)"
            @click="select(row.id)"
          >
            {{ '  '.repeat(row.depth) }}{{ row.locked ? '锁定 ' : '' }}{{ row.name }}
          </button>
        </li>
      </ul>
    </div>
    <form @submit.prevent>
      <label v-for="field in fields" :key="field.name">
        {{ field.label }}
        <input
          v-if="field.type === 'boolean'"
          type="checkbox"
          :checked="values[field.name] === 'true'"
          @change="write(field, $event)"
        />
        <select
          v-else-if="field.options?.length"
          :value="values[field.name] ?? ''"
          @change="write(field, $event)"
        >
          <option value="">未设置</option>
          <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input
          v-else
          :type="field.type === 'number' ? 'number' : 'text'"
          :value="values[field.name] ?? ''"
          @change="write(field, $event)"
        />
      </label>
    </form>
  </div>
</template>

<style scoped>
.canvas {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) 180px;
  gap: 8px;
  min-height: 240px;
}

aside,
form,
div {
  min-width: 0;
}

aside,
form {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: stretch;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

button {
  text-align: left;
  white-space: pre;
}

.before {
  box-shadow: inset 0 2px 0 #1d4ed8;
}

.after {
  box-shadow: inset 0 -2px 0 #1d4ed8;
}

.inside {
  outline: 1px solid #1d4ed8;
}
</style>
