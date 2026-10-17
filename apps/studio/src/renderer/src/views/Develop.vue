<script setup lang="ts">
import * as monaco from 'monaco-editor';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import astro from 'shiki/langs/astro.mjs';
import css from 'shiki/langs/css.mjs';
import json from 'shiki/langs/json.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useSession } from '../stores/session.ts';

self.MonacoEnvironment = {
  getWorker: () =>
    new Worker(
      new URL('../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    ),
};

const session = useSession();
const files = ref<string[]>([]);
const tabs = ref<string[]>([]);
const active = ref('');
const problems = ref<{ line: number; message: string }[]>([]);
const host = ref<HTMLElement | null>(null);
const message = ref('');
let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const models = new Map<string, monaco.editor.ITextModel>();

function language(file: string): string {
  if (file.endsWith('.astro')) return 'astro';
  if (file.endsWith('.css')) return 'css';
  if (file.endsWith('.md')) return 'markdown';
  if (file.endsWith('.json')) return 'json';
  if (file.endsWith('.ts') || file.endsWith('.mjs')) return 'typescript';
  return 'plaintext';
}

async function loadFiles(): Promise<void> {
  if (!session.siteDir) return;
  const result = await window.xiao.dev.files(session.siteDir);
  files.value = result.ok ? result.data : [];
  message.value = result.ok ? '' : result.message;
}

async function open(file: string): Promise<void> {
  if (!session.siteDir || !host.value) return;
  if (!tabs.value.includes(file)) tabs.value = [...tabs.value, file];
  active.value = file;
  let model = models.get(file);
  if (!model) {
    const result = await window.xiao.dev.read(session.siteDir, file);
    if (!result.ok) {
      message.value = result.message;
      return;
    }
    model = monaco.editor.createModel(result.data, language(file));
    models.set(file, model);
  }
  editor?.setModel(model);
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void save(), 300);
}

async function save(): Promise<void> {
  const file = active.value;
  const model = models.get(file);
  if (!session.siteDir || !model) return;
  const content = model.getValue();
  const result = await window.xiao.dev.write(session.siteDir, file, content);
  if (!result.ok) {
    message.value = result.message;
    problems.value = [{ line: 0, message: '源码有错误，修复后恢复' }];
    return;
  }
  if (file === session.pageFile) {
    window.dispatchEvent(new CustomEvent('xiao-canvas', { detail: '源码已同步' }));
  }
  const lint = await window.xiao.dev.lint(session.siteDir, file);
  problems.value = lint.ok ? lint.data : [];
}

onMounted(async () => {
  const highlighter = await createHighlighterCore({
    themes: [githubLight],
    langs: [astro, markdown, css, typescript, json],
    engine: createJavaScriptRegexEngine(),
  });
  shikiToMonaco(highlighter, monaco);
  if (!host.value) return;
  editor = monaco.editor.create(host.value, {
    theme: 'github-light',
    automaticLayout: true,
    minimap: { enabled: false },
  });
  editor.onDidChangeModelContent(schedule);
  await loadFiles();
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  editor?.dispose();
  for (const model of models.values()) model.dispose();
});
</script>

<template>
  <div class="develop">
    <ul>
      <li v-for="file in files" :key="file">
        <button type="button" @click="open(file)">{{ file }}</button>
      </li>
    </ul>
    <div>
      <p>
        <button v-for="file in tabs" :key="file" type="button" :aria-pressed="active === file" @click="open(file)">
          {{ file }}
        </button>
      </p>
      <div ref="host" class="pad"></div>
      <p v-if="message">{{ message }}</p>
      <ul>
        <li v-for="(problem, index) in problems" :key="index">{{ problem.line }} {{ problem.message }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.develop {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  min-height: 220px;
}

.pad {
  height: 180px;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: auto;
}

button {
  text-align: left;
}
</style>
