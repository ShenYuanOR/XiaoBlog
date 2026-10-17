<script setup lang="ts">
import { Crepe } from '@milkdown/crepe';
import { onBeforeUnmount, ref, watch } from 'vue';
import { markDirty, openMarkdown, saveMarkdown, type MarkdownSession } from '@xiao/core/markdown';

const props = defineProps<{ siteDir: string; slug: string }>();
const root = ref<HTMLElement | null>(null);
const message = ref('');
const title = ref('');
const category = ref('');
const draft = ref(false);
let crepe: Crepe | undefined;
let session: MarkdownSession | undefined;
let timer = 0;

async function persist(): Promise<void> {
  if (!crepe || !session) return;
  const saved = saveMarkdown(session, crepe.getMarkdown(), {
    title: JSON.stringify(title.value),
    ...(category.value ? { category: JSON.stringify(category.value) } : {}),
    draft: draft.value ? 'true' : 'false',
  });
  if (!saved.write) {
    message.value = saved.reason === 'clean' || saved.reason === 'unchanged' ? '没有需要保存的改动' : '已拒绝写盘';
    return;
  }
  const result = await window.xiao.content.write(props.siteDir, props.slug, saved.text);
  message.value = result.ok ? '已自动保存' : result.message;
  if (result.ok) session = openMarkdown(saved.text);
}

async function open(): Promise<void> {
  const result = await window.xiao.content.read(props.siteDir, props.slug);
  if (!result.ok || !root.value) {
    message.value = result.ok ? '' : result.message;
    return;
  }
  session = openMarkdown(result.data);
  title.value = result.data.match(/^title:\s*"?([^"\n]+)"?/m)?.[1] ?? '';
  category.value = result.data.match(/^category:\s*"?([^"\n]+)"?/m)?.[1] ?? '';
  draft.value = /^draft:\s*true/m.test(result.data);
  crepe?.destroy();
  crepe = new Crepe({
    root: root.value,
    defaultValue: session.body,
    featureConfigs: {
      [Crepe.Feature.ImageBlock]: {
        onUpload: async (file: File) => {
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
          if (!saved.ok) throw new Error(saved.message);
          return saved.data;
        },
        proxyDomURL: (url: string) => {
          if (!url.startsWith('./')) return url;
          const name = encodeURIComponent(url.slice(2));
          const site = encodeURIComponent(props.siteDir);
          return `xiao-asset://local/${name}?site=${site}&slug=${encodeURIComponent(props.slug)}`;
        },
      },
    },
  });
  await crepe.create();
  crepe.on((listener) => {
    listener.markdownUpdated(() => {
      if (!session) return;
      session = markDirty(session);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void persist();
      }, 1000);
    });
  });
}

watch(() => props.slug, () => void open(), { immediate: true });
onBeforeUnmount(() => {
  window.clearTimeout(timer);
  crepe?.destroy();
});
</script>

<template>
  <div class="editor-pane">
    <aside class="props">
      <label>标题 <input v-model="title" @change="persist" /></label>
      <label>分类 <input v-model="category" @change="persist" /></label>
      <label><input v-model="draft" type="checkbox" @change="persist" /> 草稿</label>
      <p>{{ message }}</p>
    </aside>
    <div ref="root" class="crepe"></div>
  </div>
</template>
