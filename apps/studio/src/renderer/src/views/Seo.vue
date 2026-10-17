<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useSession } from '../stores/session.ts';

const session = useSession();
const rows = ref<{ level: string; rule: string; detail: string }[]>([]);
const title = ref('文章标题');
const description = ref('这里是搜索结果里会看到的摘要。');

async function load(): Promise<void> {
  if (!session.siteDir) return;
  const result = await window.xiao.seo.check(session.siteDir);
  rows.value = result.ok ? result.data : [];
}

onMounted(() => void load());
watch(
  () => session.siteDir,
  () => void load(),
);
</script>

<template>
  <section class="seo">
    <h1>SEO</h1>
    <ul>
      <li v-for="(row, index) in rows" :key="index">
        <strong>{{ row.level }}</strong> {{ row.rule }} — {{ row.detail }}
      </li>
    </ul>
    <h2>搜索结果预览</h2>
    <article class="serp">
      <p>{{ title }}</p>
      <small>{{ description }}</small>
    </article>
    <h2>社交卡片</h2>
    <article class="card">
      <strong>{{ title }}</strong>
      <p>{{ description }}</p>
    </article>
  </section>
</template>
