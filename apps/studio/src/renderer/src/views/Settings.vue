<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useSession } from '../stores/session.ts';

const session = useSession();
const message = ref('');
const form = reactive({
  version: 1,
  site: { url: '', base: '/', lang: 'zh-CN', title: '', subtitle: '', description: '', favicon: '', ogImage: '', since: 2026 },
  author: { name: '', avatar: '', bio: '', email: '' },
  theme: { hue: 250, font: 'sans', contentWidth: 'prose', radius: 'md', colorScheme: 'auto' },
  seo: { titleTemplate: '%s', twitter: '', noindex: false },
  posts: { pageSize: 20, license: { enabled: true, name: '', url: '' } },
  nav: [] as { label: string; href: string }[],
  redirects: {} as Record<string, string>,
});

async function load(): Promise<void> {
  if (!session.siteDir) return;
  const result = await window.xiao.settings.read(session.siteDir);
  if (!result.ok) {
    message.value = result.message;
    return;
  }
  Object.assign(form, result.data);
  message.value = '';
}

async function save(): Promise<void> {
  const result = await window.xiao.settings.write(session.siteDir, JSON.parse(JSON.stringify(form)));
  message.value = result.ok
    ? result.data.length
      ? `没有写入：${result.data.join('、')}`
      : '已写入，重新构建后全站生效'
    : result.message;
}

onMounted(() => void load());
watch(
  () => session.siteDir,
  () => void load(),
);
</script>

<template>
  <section class="settings">
    <h1>设置与外观</h1>
    <label>标题 <input v-model="form.site.title" /></label>
    <label>副标题 <input v-model="form.site.subtitle" /></label>
    <label>简介 <input v-model="form.site.description" /></label>
    <label>地址 <input v-model="form.site.url" /></label>
    <label>base <input v-model="form.site.base" /></label>
    <label>语言 <input v-model="form.site.lang" /></label>
    <label>作者 <input v-model="form.author.name" /></label>
    <label>作者简介 <input v-model="form.author.bio" /></label>
    <label>色相 <input v-model.number="form.theme.hue" type="number" min="0" max="360" /></label>
    <label>字体 <input v-model="form.theme.font" /></label>
    <label>内容宽度 <input v-model="form.theme.contentWidth" /></label>
    <label>圆角 <input v-model="form.theme.radius" /></label>
    <label>亮暗 <input v-model="form.theme.colorScheme" /></label>
    <label>标题模板 <input v-model="form.seo.titleTemplate" /></label>
    <label>每页篇数 <input v-model.number="form.posts.pageSize" type="number" min="1" /></label>
    <label>许可名称 <input v-model="form.posts.license.name" /></label>
    <label><input v-model="form.posts.license.enabled" type="checkbox" /> 显示许可</label>
    <button v-if="session.mode === 'develop'" type="button" @click="session.editCustomCss()">
      编辑 custom.css
    </button>
    <button type="button" @click="save">保存</button>
    <p>{{ message }}</p>
  </section>
</template>
