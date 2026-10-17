<script setup lang="ts">
import { onMounted } from 'vue';
import { copy } from '../copy.ts';
import { useSession } from '../stores/session.ts';
import Conflict from './Conflict.vue';
import Posts from './Posts.vue';
import Editor from './Editor.vue';
import Settings from './Settings.vue';
import Seo from './Seo.vue';
import Canvas from './Canvas.vue';
import Pages from './Pages.vue';
import { ref } from 'vue';

const session = useSession();
const slug = ref('');
onMounted(() => {
  void session.load();
});

function allowPreviewDrop(event: DragEvent): void {
  if (session.nav === '页面' && session.drag?.kind === 'new') event.preventDefault();
}

async function dropPreview(event: DragEvent): Promise<void> {
  const name = session.drag?.kind === 'new' ? session.drag.name : '';
  session.setDrag(null);
  if (!name || !session.siteDir || session.nav !== '页面') return;
  event.preventDefault();
  const outline = await window.xiao.canvas.outline(session.siteDir, session.pageFile);
  const root = outline.ok ? outline.data[0] : undefined;
  if (!root || root.locked) {
    window.dispatchEvent(new CustomEvent('xiao-canvas', { detail: '预览里没有可放置的位置' }));
    return;
  }
  const result = await window.xiao.canvas.insert(
    session.siteDir,
    root.id,
    root.children.length,
    name,
    session.pageFile,
  );
  window.dispatchEvent(
    new CustomEvent('xiao-canvas', { detail: result.ok ? `已放到预览 ${name}` : result.message }),
  );
}

async function setPreview(mode: 'phone' | 'tablet' | 'pc' | 'side'): Promise<void> {
  if (!session.previewUrl) return;
  await window.xiao.preview.set(mode, session.previewUrl);
}

async function choose(action: 'keep' | 'load' | 'compare'): Promise<void> {
  if (!session.conflict) return;
  if (action === 'compare') {
    session.compare = true;
    return;
  }
  await window.xiao.project.resolve(session.conflict.file, action);
  session.setConflict(null);
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <strong>{{ session.siteTitle || copy.appName }}</strong>
      <span class="status">{{ session.status }}</span>
      <div class="modes">
        <button type="button" :aria-pressed="session.mode === 'write'" @click="session.setMode('write')">
          {{ copy.modeWrite }}
        </button>
        <button
          type="button"
          :aria-pressed="session.mode === 'develop'"
          @click="session.setMode('develop')"
        >
          {{ copy.modeDevelop }}
        </button>
      </div>
      <span>{{ copy.preview }}</span>
      <button type="button" @click="setPreview('phone')">手机</button>
      <button type="button" @click="setPreview('tablet')">平板</button>
      <button type="button" @click="setPreview('pc')">电脑</button>
      <button type="button" @click="setPreview('side')">并排</button>
      <button type="button" disabled>{{ copy.publish }}</button>
    </header>
    <Conflict
      v-if="session.conflict"
      :file="session.conflict.file"
      :mine="session.conflict.mine"
      :disk="session.conflict.disk"
      :compare="session.compare"
      @choose="choose"
    />
    <p v-if="session.reloaded">{{ session.reloaded }}</p>
    <div class="body">
      <nav class="nav" aria-label="主导航">
        <button
          v-for="item in copy.nav"
          :key="item"
          type="button"
          :aria-current="session.nav === item ? 'page' : undefined"
          @click="session.setNav(item)"
        >
          {{ item }}
        </button>
      </nav>
      <aside class="list">
        <h1>{{ session.nav }}</h1>
        <Posts v-if="session.nav === '文章' && session.siteDir" @select="slug = $event" />
        <Pages v-else-if="session.nav === '页面' && session.siteDir" />
        <p v-else>{{ copy.sideNote }}</p>
      </aside>
      <main class="editor">
        <Canvas v-if="session.nav === '页面'" />
        <Seo v-else-if="session.nav === 'SEO'" />
        <Settings v-else-if="session.nav === '设置' || session.nav === '外观'" />
        <Editor v-else-if="slug && session.siteDir" :site-dir="session.siteDir" :slug="slug" />
        <h1 v-else>{{ copy.editor }}</h1>
        <p v-if="!slug">{{ copy.empty }}</p>
        <p v-if="session.mode === 'develop'">开发者模式的文件树和输出面板还没接上。</p>
      </main>
      <aside class="preview" @dragover="allowPreviewDrop" @drop="dropPreview">
        <h1>{{ copy.preview }}</h1>
        <p>{{ copy.previewNote }}</p>
        <pre v-if="session.mode === 'develop'" class="output">{{ session.logs || '输出是空的。' }}</pre>
      </aside>
    </div>
  </div>
</template>
