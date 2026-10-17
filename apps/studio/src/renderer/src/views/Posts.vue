<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useSession } from '../stores/session.ts';

const session = useSession();
const posts = ref<{ slug: string; title: string; category: string; draft: boolean }[]>([]);
const title = ref('');
const category = ref('生活');
const message = ref('');
const grouped = computed(() => {
  const groups = new Map<string, typeof posts.value>();
  for (const post of posts.value) {
    const list = groups.get(post.category) ?? [];
    list.push(post);
    groups.set(post.category, list);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, posts: items }));
});

async function load(): Promise<void> {
  if (!session.siteDir) return;
  const result = await window.xiao.content.list(session.siteDir);
  posts.value = result.ok ? result.data : [];
}

async function create(): Promise<void> {
  const result = await window.xiao.content.create(session.siteDir, title.value, category.value);
  message.value = result.ok ? `已新建 ${result.data.slug}` : result.message;
  title.value = '';
  await load();
}

async function remove(slug: string): Promise<void> {
  if (!window.confirm(`把「${slug}」移入回收区？`)) return;
  await window.xiao.content.remove(session.siteDir, slug);
  await load();
}

async function rename(slug: string): Promise<void> {
  const next = window.prompt('新的 slug', slug);
  if (!next || next === slug) return;
  const result = await window.xiao.content.rename(session.siteDir, slug, next);
  message.value = result.ok ? `${result.data.from} → ${result.data.to}` : result.message;
  await load();
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
  <div>
    <form @submit.prevent="create">
      <input v-model="title" placeholder="新文章标题" />
      <input v-model="category" placeholder="分类" />
      <button type="submit">新建</button>
    </form>
    <section v-for="group in grouped" :key="group.name">
      <h2>{{ group.name }}</h2>
      <ul>
        <li v-for="post in group.posts" :key="post.slug">
          <span>{{ post.title }}</span>
          <button type="button" @click="rename(post.slug)">重命名</button>
          <button type="button" @click="remove(post.slug)">删除</button>
        </li>
      </ul>
    </section>
    <p v-if="message">{{ message }}</p>
  </div>
</template>
