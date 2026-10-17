<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { copy } from '../copy.ts';
import { useSession } from '../stores/session.ts';

const router = useRouter();
const session = useSession();
const parent = ref('');
const title = ref('我的笔记');
const author = ref('');
const message = ref('');
const busy = ref(false);
const recent = ref<{ dir: string; title: string }[]>([]);

async function refresh(): Promise<void> {
  const result = await window.xiao.project.recent();
  recent.value = result.ok ? result.data : [];
}

async function choose(): Promise<void> {
  const result = await window.xiao.project.pick();
  if (result.ok && result.data) parent.value = result.data;
}

async function enter(dir: string, siteTitle: string): Promise<void> {
  session.setSite(dir, siteTitle);
  await router.push('/studio');
}

async function create(): Promise<void> {
  busy.value = true;
  message.value = '正在新建，离线安装可能要一两分钟。';
  const result = await window.xiao.project.create(parent.value, title.value, author.value);
  busy.value = false;
  if (!result.ok) {
    message.value = result.message;
    return;
  }
  await enter(result.data.dir, result.data.title);
}

async function open(dir?: string): Promise<void> {
  busy.value = true;
  const result = await window.xiao.project.open(dir);
  busy.value = false;
  if (!result.ok) {
    message.value = result.message;
    return;
  }
  if (!result.data) return;
  await enter(result.data.dir, result.data.title);
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <main class="welcome">
    <h1>{{ copy.welcomeTitle }}</h1>
    <p>{{ copy.welcomeLead }}</p>
    <section>
      <h2>新建站点</h2>
      <label>父目录 <input v-model="parent" readonly placeholder="还没选" /></label>
      <button type="button" @click="choose">选择文件夹</button>
      <label>站点名 <input v-model="title" /></label>
      <label>作者 <input v-model="author" placeholder="可留空" /></label>
      <button type="button" :disabled="busy" @click="create">新建并预览</button>
    </section>
    <section>
      <h2>打开</h2>
      <button type="button" :disabled="busy" @click="open()">打开文件夹</button>
      <ul>
        <li v-for="item in recent" :key="item.dir">
          <button type="button" :disabled="busy" @click="open(item.dir)">{{ item.title }}</button>
          <span>{{ item.dir }}</span>
        </li>
      </ul>
    </section>
    <p v-if="message">{{ message }}</p>
  </main>
</template>
