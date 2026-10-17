<script setup lang="ts">
import { onMounted } from 'vue';
import { copy } from '../copy.ts';
import { useSession } from '../stores/session.ts';

const session = useSession();
onMounted(() => {
  void session.load();
});
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
      <button type="button" disabled>{{ copy.publish }}</button>
    </header>
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
        <p>{{ copy.sideNote }}</p>
      </aside>
      <main class="editor">
        <h1>{{ copy.editor }}</h1>
        <p>{{ copy.empty }}</p>
        <p v-if="session.mode === 'develop'">开发者模式的文件树和输出面板还没接上。</p>
      </main>
      <aside class="preview">
        <h1>{{ copy.preview }}</h1>
        <p>{{ copy.previewNote }}</p>
        <pre v-if="session.mode === 'develop'" class="output">{{ session.logs || '输出是空的。' }}</pre>
      </aside>
    </div>
  </div>
</template>
