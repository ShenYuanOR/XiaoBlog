<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useSession } from '../stores/session.ts';

const session = useSession();
const pages = ref<string[]>([]);
const slug = ref('');
const message = ref('');

async function load(): Promise<void> {
  if (!session.siteDir) return;
  const result = await window.xiao.page.list(session.siteDir);
  pages.value = result.ok ? result.data : [];
  message.value = result.ok ? '' : result.message;
}

async function create(template: 'blank' | 'landing' | 'about'): Promise<void> {
  const result = await window.xiao.page.create(session.siteDir, template, slug.value.trim());
  message.value = result.ok ? `已新建 ${result.data}` : result.message;
  if (result.ok) {
    session.setPage(result.data);
    slug.value = '';
  }
  await load();
}

onMounted(() => void load());
</script>

<template>
  <label>地址 <input v-model="slug" /></label>
  <button type="button" @click="create('blank')">空白</button>
  <button type="button" @click="create('landing')">落地页</button>
  <button type="button" @click="create('about')">关于</button>
  <p v-if="message">{{ message }}</p>
  <ul>
    <li v-for="file in pages" :key="file">
      <button type="button" :aria-pressed="session.pageFile === file" @click="session.setPage(file)">
        {{ file }}
      </button>
    </li>
  </ul>
</template>
