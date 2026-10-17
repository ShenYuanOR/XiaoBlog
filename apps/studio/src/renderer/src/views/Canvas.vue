<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { CanvasField, CanvasNode } from '../env.d.ts';
import { useSession } from '../stores/session.ts';

const session = useSession();
const names = ref<string[]>([]);
const tree = ref<CanvasNode[]>([]);
const selected = ref('');
const fields = ref<CanvasField[]>([]);
const values = ref<Record<string, string>>({});
const message = ref('');

function flatten(nodes: CanvasNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'  '.repeat(depth)}${node.locked ? '锁定 ' : ''}${node.name}` },
    ...flatten(node.children, depth + 1),
  ]);
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
  const outline = await window.xiao.canvas.outline(session.siteDir);
  names.value = listed.ok ? listed.data : [];
  tree.value = outline.ok ? outline.data : [];
  message.value = outline.ok ? message.value : outline.message;
  if (keep) await show(at(tree.value, keep));
}

async function select(id: string): Promise<void> {
  selected.value = id;
  await show(at(tree.value, pathOf(tree.value, id) ?? []));
}

async function add(name: string): Promise<void> {
  const parent = selected.value || tree.value[0]?.id;
  if (!session.siteDir || !parent) return;
  const keep = pathOf(tree.value, parent);
  const result = await window.xiao.canvas.insert(session.siteDir, parent, name);
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
  const result = await window.xiao.canvas.setProp(session.siteDir, selected.value, field.name, value);
  message.value = result.ok ? `已改 ${field.label}` : result.message;
  values.value = { ...values.value, [field.name]: raw };
  await load(keep);
}

onMounted(() => void load());
</script>

<template>
  <div class="canvas">
    <aside>
      <button v-for="name in names" :key="name" type="button" @click="add(name)">{{ name }}</button>
    </aside>
    <div>
      <p v-if="message">{{ message }}</p>
      <ul>
        <li v-for="item in flatten(tree)" :key="item.id">
          <button type="button" :aria-pressed="selected === item.id" @click="select(item.id)">
            {{ item.label }}
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
</style>
