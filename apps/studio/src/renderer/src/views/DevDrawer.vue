<script lang="ts">
import { shikiToMonaco } from '@shikijs/monaco';
import * as monaco from 'monaco-editor';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import astro from 'shiki/langs/astro.mjs';
import css from 'shiki/langs/css.mjs';
import json from 'shiki/langs/json.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import githubLight from 'shiki/themes/github-light.mjs';

// Monaco 的 worker 由 Vite 打包成独立模块；沿用旧 Develop.vue 的写法，不要改成默认 CDN 路径。
self.MonacoEnvironment = {
  getWorker: () =>
    new Worker(
      new URL('../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    ),
};

/**
 * Shiki 高亮器整个进程只建一次：抽屉反复开关、切换站点都不重复初始化。
 * 主题同时注册明暗两套，切主题只需调用 monaco.editor.setTheme。
 */
let highlighterTask: Promise<boolean> | undefined;
let highlighterReady = false;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

/** 读界面令牌，让 Monaco 字体/字号与界面一致（Monaco 只接受字符串，不能用 CSS 变量）。 */
function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function monacoTheme(): string {
  const light = document.documentElement.dataset.theme === 'light';
  if (!highlighterReady) return light ? 'vs' : 'vs-dark';
  return light ? 'github-light' : 'github-dark';
}

function ensureHighlighter(): Promise<boolean> {
  if (!highlighterTask) {
    highlighterTask = (async () => {
      try {
        const highlighter = await createHighlighterCore({
          themes: [githubLight, githubDark],
          langs: [astro, markdown, css, typescript, json],
          engine: createJavaScriptRegexEngine(),
        });
        shikiToMonaco(highlighter, monaco as unknown as Parameters<typeof shikiToMonaco>[1]);
        highlighterReady = true;
        return true;
      } catch (error) {
        // 没有高亮也要能编辑；失败后不再重试，避免每次切页签都卡一下。
        console.error('[dev] 语法高亮加载失败', error);
        return false;
      }
    })();
  }
  return highlighterTask;
}
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import { UiBadge, UiButton, UiEmpty, UiIcon, UiRow, UiSpinner } from '../ui/index.ts';
import FileNav from './FileNav.vue';

/**
 * 开发者模式的 IDE：左侧文件树常驻，中间多标签 Monaco，底部输出/问题可收起。
 * Monaco、Shiki、写回和 lint 沿用原来的逻辑。
 * 只维护自己的视图状态，不改 store / Shell / 主进程。
 */

interface LintItem {
  line: number;
  message: string;
}

interface ProblemRow extends LintItem {
  file: string;
  parse: boolean;
}

/** 停手多久写回；与主进程 SOURCE_SYNC_MS 保持一致。 */
const WRITE_DEBOUNCE_MS = 300;

const emit = defineEmits<{ close: [] }>();

const session = useSession();
const tabs = ref<string[]>([]);
const panelOpen = ref(false);
const panelTab = ref<'output' | 'problems'>('output');
const active = ref('');
const host = ref<HTMLElement | null>(null);
const consoleEl = ref<HTMLElement | null>(null);
const dirty = ref<Record<string, boolean>>({});
const paused = ref<Record<string, string>>({});
const problemsByFile = ref<Record<string, LintItem[]>>({});
const pendingWrites = ref(0);
const pendingLints = ref(0);

let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let disposed = false;
let writeChain: Promise<void> = Promise.resolve();
const models = new Map<string, monaco.editor.ITextModel>();
const savedText = new Map<string, string>();
const timers = new Map<string, number>();
const lintedFiles = new Set<string>();
const lintingFiles = new Set<string>();

const logText = computed(() => (session.logs ? stripAnsi(session.logs) : ''));

const activePaused = computed(() =>
  active.value ? (paused.value[active.value] ?? '') : '',
);

const problemRows = computed<ProblemRow[]>(() => {
  const rows: ProblemRow[] = [];
  for (const [file, items] of Object.entries(problemsByFile.value)) {
    for (const item of items) {
      rows.push({ file, line: item.line, message: item.message, parse: isParseError(item) });
    }
  }
  rows.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
  return rows;
});

function basename(file: string): string {
  return file.split('/').at(-1) ?? file;
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function languageOf(file: string): string {
  if (file.endsWith('.astro')) return 'astro';
  if (file.endsWith('.css')) return 'css';
  if (file.endsWith('.md')) return 'markdown';
  if (file.endsWith('.json')) return 'json';
  if (file.endsWith('.ts') || file.endsWith('.mjs')) return 'typescript';
  return 'plaintext';
}

/** dev.lint 只回 line/message，没有 severity：带 "Parsing error" 的当错误，其余当警告。 */
function isParseError(item: LintItem): boolean {
  return /parsing error|unexpected token|解析/i.test(item.message);
}

function enqueue(run: () => Promise<void>): Promise<void> {
  const next = writeChain.then(run, run);
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function markDirty(file: string): void {
  if (dirty.value[file]) return;
  dirty.value = { ...dirty.value, [file]: true };
}

function clearDirty(file: string): void {
  if (!dirty.value[file]) return;
  const next = { ...dirty.value };
  delete next[file];
  dirty.value = next;
}

function storeLint(file: string, items: LintItem[]): void {
  const next = { ...problemsByFile.value };
  if (items.length > 0) next[file] = items;
  else delete next[file];
  problemsByFile.value = next;
}

/** 解析错误 → 暂停该文件的自动写回，避免把明显坏掉的内容反复落盘。 */
function updatePaused(file: string, items: LintItem[]): void {
  const first = items.find((item) => isParseError(item));
  if (first) {
    if (paused.value[file]) return;
    paused.value = { ...paused.value, [file]: first.message };
    notify(
      `「${basename(file)}」有解析错误，已暂停自动写回；修好后点「重试写回」。`,
      'error',
      'dev-write-parse',
    );
    return;
  }
  if (paused.value[file]) {
    const next = { ...paused.value };
    delete next[file];
    paused.value = next;
    notify(`「${basename(file)}」解析已恢复正常，自动写回继续。`, 'info', 'dev-write-parse');
  }
}

async function lintFile(file: string): Promise<void> {
  if (!session.siteDir || lintingFiles.has(file)) return;
  lintingFiles.add(file);
  lintedFiles.add(file);
  pendingLints.value += 1;
  try {
    const result = await window.xiao.dev.lint(session.siteDir, file);
    if (disposed) return;
    if (!result.ok) {
      notify(
        `检查「${basename(file)}」失败：${result.message}。稍后点「重新检查」再试。`,
        'error',
        'dev-lint',
      );
      return;
    }
    storeLint(file, result.data);
    updatePaused(file, result.data);
  } catch (error) {
    if (!disposed) {
      notify(`检查「${basename(file)}」出错：${describeError(error)}。`, 'error', 'dev-lint');
    }
  } finally {
    lintingFiles.delete(file);
    pendingLints.value = Math.max(0, pendingLints.value - 1);
  }
}

async function writeFile(file: string, force: boolean): Promise<boolean> {
  const model = models.get(file);
  if (!model || !session.siteDir) return false;
  const content = model.getValue();
  if (content === savedText.get(file)) {
    clearDirty(file);
    return true;
  }
  // 写前拦截：这个文件上次检查出解析错误，等用户主动点「重试写回」再落盘。
  if (!force && paused.value[file]) return false;
  pendingWrites.value += 1;
  try {
    const result = await window.xiao.dev.write(session.siteDir, file, content);
    if (!result.ok) {
      notify(
        `写盘失败：${result.message}。内容还在编辑器里，修好后停手 300ms 会自动再试。`,
        'error',
        'dev-write',
      );
      return false;
    }
    savedText.set(file, content);
    clearDirty(file);
    if (file === session.activePage) {
      window.dispatchEvent(new CustomEvent('xiao-canvas', { detail: `${file} 源码已同步` }));
    }
    void lintFile(file);
    return true;
  } catch (error) {
    notify(`写盘出错：${describeError(error)}。请稍后再试。`, 'error', 'dev-write');
    return false;
  } finally {
    pendingWrites.value = Math.max(0, pendingWrites.value - 1);
  }
}

function scheduleSave(file: string): void {
  const timer = timers.get(file);
  if (timer !== undefined) window.clearTimeout(timer);
  timers.set(
    file,
    window.setTimeout(() => {
      timers.delete(file);
      void enqueue(() => writeFile(file, false).then(() => undefined));
    }, WRITE_DEBOUNCE_MS),
  );
}

async function ensureEditor(): Promise<void> {
  if (disposed) return;
  await ensureHighlighter();
  await nextTick();
  if (disposed || editor || !host.value) return;
  editor = monaco.editor.create(host.value, {
    theme: monacoTheme(),
    automaticLayout: true,
    wordWrap: 'on',
    minimap: { enabled: false },
    fontFamily: cssToken('--ui-mono') || 'monospace',
    fontSize: Number.parseInt(cssToken('--ui-fs-2'), 10) || 13,
    scrollBeyondLastLine: false,
    padding: { top: 6 },
  });
  if (active.value) editor.setModel(models.get(active.value) ?? null);
}

function togglePanel(next: 'output' | 'problems'): void {
  if (panelOpen.value && panelTab.value === next) {
    panelOpen.value = false;
    return;
  }
  panelTab.value = next;
  panelOpen.value = true;
}

async function openFile(file: string, line?: number): Promise<void> {
  if (!file) return;
  if (!tabs.value.includes(file)) tabs.value = [...tabs.value, file];
  active.value = file;
  await ensureEditor();
  if (disposed) return;

  let model = models.get(file);
  if (!model) {
    if (!session.siteDir) return;
    const result = await window.xiao.dev.read(session.siteDir, file);
    if (!result.ok) {
      notify(
        `读不到「${basename(file)}」：${result.message}。文件可能被删或改名，切到「文件」页签刷新看看。`,
        'error',
        'dev-read',
      );
      tabs.value = tabs.value.filter((item) => item !== file);
      if (active.value === file) {
        active.value = tabs.value.at(-1) ?? '';
        editor?.setModel(active.value ? (models.get(active.value) ?? null) : null);
      }
      return;
    }
    model = models.get(file) ?? monaco.editor.createModel(result.data, languageOf(file));
    if (!models.has(file)) {
      models.set(file, model);
      savedText.set(file, result.data);
      model.onDidChangeContent(() => {
        markDirty(file);
        scheduleSave(file);
      });
    }
    void lintFile(file);
  }

  if (disposed) return;
  editor?.setModel(model);
  if (line !== undefined && line > 0) {
    editor?.revealLineInCenter(line);
    editor?.setPosition({ lineNumber: line, column: 1 });
    editor?.focus();
  }
}

function activate(file: string): void {
  if (!file) return;
  active.value = file;
  const model = models.get(file);
  if (model) editor?.setModel(model);
  else void openFile(file);
}

function scrollConsole(): void {
  const element = consoleEl.value;
  if (!element) return;
  element.scrollTop = element.scrollHeight;
}

async function closeTab(file: string): Promise<void> {
  const timer = timers.get(file);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timers.delete(file);
  }
  const model = models.get(file);
  if (model && session.siteDir) {
    const content = model.getValue();
    if (content !== savedText.get(file) && !paused.value[file]) {
      await enqueue(() => writeFile(file, false).then(() => undefined));
    }
    // 没写回就别关：一旦 dispose 模型，编辑器里的内容就没了。
    if (model.getValue() !== savedText.get(file)) {
      const reason = paused.value[file] ? '（这个文件有解析错误）' : '';
      notify(
        `「${basename(file)}」还有内容没写回${reason}，先别关这个标签；修好后会自动写回，也可以用「重试写回」。`,
        'error',
        'dev-write',
      );
      return;
    }
  }
  tabs.value = tabs.value.filter((item) => item !== file);
  const next = active.value === file ? (tabs.value.at(-1) ?? '') : active.value;
  active.value = next;
  editor?.setModel(next ? (models.get(next) ?? null) : null);
  if (model) model.dispose();
  models.delete(file);
  savedText.delete(file);
  clearDirty(file);
  lintedFiles.delete(file);
  if (paused.value[file]) {
    const nextPaused = { ...paused.value };
    delete nextPaused[file];
    paused.value = nextPaused;
  }
  if (problemsByFile.value[file]) {
    const nextProblems = { ...problemsByFile.value };
    delete nextProblems[file];
    problemsByFile.value = nextProblems;
  }
}

function retryWrite(file: string): void {
  if (!file) return;
  if (paused.value[file]) {
    const next = { ...paused.value };
    delete next[file];
    paused.value = next;
  }
  void enqueue(async () => {
    const ok = await writeFile(file, true);
    if (ok) notify(`已写回「${basename(file)}」。`, 'info', 'dev-write');
  });
}

/** Ctrl+S / Shell 的 xiao:save：把打开标签里的未写内容全部落盘（有解析错误的跳过）。 */
function onSaveShortcut(): void {
  for (const timer of timers.values()) window.clearTimeout(timer);
  timers.clear();
  void enqueue(async () => {
    const blocked: string[] = [];
    for (const file of [...tabs.value]) {
      const ok = await writeFile(file, false);
      if (!ok && paused.value[file]) blocked.push(basename(file));
    }
    if (blocked.length > 0) {
      notify(
        `这些文件还有解析错误，已跳过写盘：${blocked.join('、')}。修好后点「重试写回」。`,
        'error',
        'dev-write-parse',
      );
    }
  });
}

/** 卸载/换站点前尽力把未写内容落盘（换站点时传旧目录）。 */
function flushAll(dir: string): void {
  if (!dir) return;
  const skipped: string[] = [];
  for (const [file, model] of models) {
    const content = model.getValue();
    if (content === savedText.get(file)) continue;
    if (paused.value[file]) {
      skipped.push(basename(file));
      continue;
    }
    void window.xiao.dev.write(dir, file, content).then((result) => {
      if (!result.ok) notify(`「${basename(file)}」没能写回：${result.message}。`, 'error', 'dev-write');
    });
  }
  if (skipped.length > 0) {
    notify(
      `这些文件有解析错误，离开开发者模式时没有写回：${skipped.join('、')}。回到开发者模式修好后再写。`,
      'error',
      'dev-write-parse',
    );
  }
}

async function lintAll(): Promise<void> {
  if (!session.siteDir) {
    notify('还没打开站点，没法检查源码。', 'info', 'dev-lint');
    return;
  }
  if (!tabs.value.length) {
    notify('先在左侧文件树打开一个源码文件，再检查。', 'info', 'dev-lint');
    return;
  }
  await Promise.all(tabs.value.map((file) => lintFile(file)));
}

function openProblem(row: ProblemRow): void {
  void openFile(row.file, row.line);
}

function reset(): void {
  for (const timer of timers.values()) window.clearTimeout(timer);
  timers.clear();
  for (const model of models.values()) model.dispose();
  models.clear();
  savedText.clear();
  lintedFiles.clear();
  lintingFiles.clear();
  tabs.value = [];
  active.value = '';
  dirty.value = {};
  paused.value = {};
  problemsByFile.value = {};
  editor?.setModel(null);
}

onMounted(() => {
  window.addEventListener('xiao:save', onSaveShortcut);
  if (session.devOpen) void openFile(session.devOpen);
});

onBeforeUnmount(() => {
  window.removeEventListener('xiao:save', onSaveShortcut);
  for (const timer of timers.values()) window.clearTimeout(timer);
  timers.clear();
  flushAll(session.siteDir);
  disposed = true;
  editor?.dispose();
  editor = undefined;
  for (const model of models.values()) model.dispose();
  models.clear();
});

watch([panelOpen, panelTab], ([open, which]) => {
  if (!open) return;
  if (which === 'output') {
    void nextTick(scrollConsole);
    return;
  }
  const missing = tabs.value.filter((file) => !lintedFiles.has(file));
  if (missing.length > 0) void Promise.all(missing.map((file) => lintFile(file)));
});

watch(
  () => session.logs,
  () => {
    if (panelOpen.value && panelTab.value === 'output') void nextTick(scrollConsole);
  },
);

watch(
  () => session.theme,
  () => {
    if (!editor) return;
    monaco.editor.setTheme(monacoTheme());
  },
);

watch(
  () => session.devOpen,
  (file) => {
    if (file) void openFile(file);
  },
);

watch(
  () => session.siteDir,
  (next, previous) => {
    if (previous && previous !== next) flushAll(previous);
    reset();
  },
);
</script>

<template>
  <div class="dev">
    <header class="dev__head">
      <span class="dev__title">源码</span>
      <UiButton
        class="dev__close"
        variant="ghost"
        size="sm"
        :icon="icons.close"
        aria-label="回到创作模式"
        title="回到创作模式"
        @click="emit('close')"
      />
    </header>

    <div class="dev__work">
      <aside class="dev__side" aria-label="文件树">
        <FileNav :active="active" @open="(file) => void openFile(file)" />
      </aside>

      <section class="dev__editor">
        <div v-if="tabs.length" class="code__tabs" role="tablist" aria-label="打开的文件">
          <div
            v-for="file in tabs"
            :key="file"
            class="code__tab"
            :class="{ 'is-active': file === active }"
          >
            <button type="button" class="code__tab-label" :title="file" @click="activate(file)">
              <span class="code__tab-name">{{ basename(file) }}</span>
              <span v-if="dirty[file]" class="code__dot" aria-label="有未保存改动" />
            </button>
            <button
              type="button"
              class="code__tab-close"
              aria-label="关闭标签"
              title="关闭标签"
              @click="closeTab(file)"
            >
              <UiIcon :path="icons.close" :size="12" />
            </button>
          </div>
        </div>

        <div v-if="activePaused" class="code__paused" role="status">
          <UiIcon :path="icons.alert" :size="16" />
          <span class="code__paused-text" :title="activePaused">{{ activePaused }}</span>
          <UiButton size="sm" :icon-left="icons.refresh" @click="retryWrite(active)">
            重试写回
          </UiButton>
        </div>

        <div v-show="tabs.length" ref="host" class="code__host" />

        <UiEmpty
          v-if="!tabs.length"
          class="code__empty"
          :icon="icons.editor"
          title="还没打开文件"
          description="在左侧文件树点一个文件，这里会新开一个标签。"
        />
      </section>
    </div>

    <section class="dev__panel" :class="{ 'is-open': panelOpen }">
      <div class="dev__panel-bar">
        <button
          type="button"
          class="dev__panel-tab"
          :class="{ 'is-active': panelOpen && panelTab === 'output' }"
          @click="togglePanel('output')"
        >
          输出
        </button>
        <button
          type="button"
          class="dev__panel-tab"
          :class="{ 'is-active': panelOpen && panelTab === 'problems' }"
          @click="togglePanel('problems')"
        >
          问题<span v-if="problemRows.length"> {{ problemRows.length }}</span>
        </button>
      </div>

      <div v-if="panelOpen" class="dev__panel-body">
      <section v-if="panelTab === 'output'" class="pane output">
        <pre v-if="logText" ref="consoleEl" class="output__log">{{ logText }}</pre>
        <UiEmpty
          v-else
          :icon="icons.console"
          title="还没有运行时日志"
          description="启动预览或构建后，dev 服务器的输出会实时出现在这里。"
        />
      </section>

      <section v-else class="pane problems">
        <div class="problems__head">
          <UiButton
            size="sm"
            :icon-left="icons.refresh"
            :loading="pendingLints > 0"
            @click="lintAll"
          >
            重新检查
          </UiButton>
          <span class="problems__hint">ESLint 只检查已打开的源码文件</span>
          <span v-if="pendingWrites > 0" class="problems__hint">正在写回…</span>
        </div>

        <div v-if="pendingLints > 0 && !problemRows.length" class="problems__loading">
          <UiSpinner :size="14" />
          <span>正在检查…</span>
        </div>

        <div v-if="problemRows.length" class="problems__list">
          <UiRow
            v-for="(row, index) in problemRows"
            :key="`${row.file}:${row.line}:${index}`"
            @click="openProblem(row)"
          >
            <template #icon>
              <UiIcon :path="row.parse ? icons.alert : icons.help" :size="16" />
            </template>
            <span class="problems__text" :title="`${row.file}:${row.line} ${row.message}`">
              <span class="problems__file">{{ basename(row.file) }}:{{ row.line }}</span>
              <span class="problems__message"> {{ row.message }}</span>
            </span>
            <template #meta>
              <UiBadge :tone="row.parse ? 'danger' : 'warn'">
                {{ row.parse ? '错误' : '警告' }}
              </UiBadge>
            </template>
          </UiRow>
        </div>

        <UiEmpty
          v-else-if="pendingLints === 0"
          :icon="icons.ok"
          title="没有问题"
          :description="
            tabs.length
              ? 'ESLint 没有报告问题。改完源码后会自动再检查。'
              : '先在左侧文件树打开一个源码文件，再回来检查。'
          "
        />
      </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dev {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-panel);
  color: var(--ui-text);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.dev__head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s2);
  height: 32px;
  padding: 0 var(--ui-s2);
  border-bottom: 1px solid var(--ui-line);
}

.dev__title {
  flex: 1;
  min-width: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  font-weight: 600;
}

.dev__close {
  flex: none;
}

.dev__work {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.dev__side {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 260px;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--ui-line);
}

.dev__editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.dev__panel {
  flex: none;
  border-top: 1px solid var(--ui-line);
  background: var(--ui-bg);
}

.dev__panel-bar {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  height: 28px;
  padding: 0 var(--ui-s2);
}

.dev__panel-tab {
  height: 22px;
  padding: 0 var(--ui-s2);
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-3);
  font: inherit;
  font-size: var(--ui-fs-1);
  cursor: pointer;
}

.dev__panel-tab.is-active {
  background: var(--ui-active);
  color: var(--ui-text);
}

.dev__panel-body {
  display: flex;
  flex-direction: column;
  height: 200px;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--ui-line);
}

.pane {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.code__dot {
  display: inline-block;
  flex: none;
  width: var(--ui-s1);
  height: var(--ui-s1);
  border-radius: var(--ui-r-lg);
  background: var(--ui-warn);
}

/* 代码 */
.code__tabs {
  display: flex;
  flex: none;
  align-items: stretch;
  overflow-x: auto;
  border-bottom: 1px solid var(--ui-line);
}

.code__tab {
  display: flex;
  flex: none;
  align-items: center;
  border-right: 1px solid var(--ui-line);
}

.code__tab.is-active {
  background: var(--ui-active);
}

.code__tab-label {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  height: var(--ui-h-sm);
  padding: 0 var(--ui-s2);
  border: 0;
  background: transparent;
  color: var(--ui-text-2);
  font: inherit;
  font-size: var(--ui-fs-2);
  cursor: pointer;
}

.code__tab.is-active .code__tab-label {
  color: var(--ui-text);
}

.code__tab-name {
  max-width: 180px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.code__tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-s5);
  height: var(--ui-h-sm);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-3);
  cursor: pointer;
}

.code__tab-close:hover {
  color: var(--ui-text);
  background: var(--ui-hover);
}

.code__tab-label:focus-visible,
.code__tab-close:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.code__paused {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s1) var(--ui-s3);
  background: var(--ui-danger-weak);
  color: var(--ui-danger);
  font-size: var(--ui-fs-1);
}

.code__paused-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.code__host {
  flex: 1;
  min-height: 0;
}

.code__empty {
  flex: 1;
}

/* 输出 */
.output__log {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: var(--ui-s2) var(--ui-s3);
  overflow: auto;
  background: var(--ui-bg);
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 问题 */
.problems__head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s1) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.problems__hint {
  overflow: hidden;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.problems__loading {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s3);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.problems__list {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding: var(--ui-s1) var(--ui-s2);
}

.problems__text {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.problems__file {
  color: var(--ui-text);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.problems__message {
  color: var(--ui-text-2);
}
</style>
