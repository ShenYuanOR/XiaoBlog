<script setup lang="ts">
import { Crepe } from '@milkdown/crepe';
import { markDirty, openMarkdown, saveMarkdown, type MarkdownSession } from '@xiao/core/markdown';
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import sample from './sample.md?raw';

const host = ref<HTMLDivElement | null>(null);
const status = ref('尚未保存');
const session = shallowRef<MarkdownSession>(openMarkdown(sample));
let crepe: Crepe | undefined;

onMounted(async () => {
  const root = host.value;
  if (!root) return;
  const opened = openMarkdown(sample);
  session.value = opened;
  crepe = new Crepe({
    root,
    defaultValue: opened.body,
    features: {
      [Crepe.Feature.ImageBlock]: false,
      [Crepe.Feature.AI]: false,
    },
  });
  crepe.on((api) => {
    api.updated((_ctx, doc, prev) => {
      if (prev && !doc.eq(prev)) session.value = markDirty(session.value);
    });
  });
  await crepe.create();
});

function save(): void {
  if (!crepe) return;
  const result = saveMarkdown(session.value, crepe.getMarkdown());
  status.value = result.write ? '已写回，未改动的块保持原文' : `未写盘：${result.reason}`;
}

onBeforeUnmount(() => {
  void crepe?.destroy();
});
</script>

<template>
  <main>
    <h1>Markdown 保真写回</h1>
    <p>{{ status }}</p>
    <button type="button" @click="save">保存</button>
    <div ref="host" class="editor"></div>
  </main>
</template>

<style>
main {
  max-width: 760px;
  margin: 24px auto;
  font-family: sans-serif;
}
.editor {
  margin-top: 16px;
  border: 1px solid #ccc;
}
</style>
