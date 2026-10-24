<script setup lang="ts">
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame-dark.css';
import type { IpcResult } from '@xiao/core/ipc';
import {
  markDirty,
  openMarkdown,
  patchFrontmatter,
  saveMarkdown,
  type MarkdownSession,
  type SaveResult,
} from '@xiao/core/markdown';
import * as monaco from 'monaco-editor';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { copy } from '../copy.ts';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
  UiEmpty,
  UiField,
  UiIcon,
  UiInput,
  UiSegmented,
  UiSelect,
  UiSpinner,
  UiSwitch,
  UiTextarea,
  UiTooltip,
} from '../ui/index.ts';

// Monaco 的 worker 由 Vite 打包成独立模块；沿用旧实现的写法，不要改成默认 CDN 路径。
self.MonacoEnvironment = {
  getWorker: () =>
    new Worker(new URL('../../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), {
      type: 'module',
    }),
};

const props = defineProps<{ siteDir: string; slug: string }>();

const sessionStore = useSession();

type ViewState = 'loading' | 'ready' | 'empty' | 'error';
type ContentFormat = 'markdown' | 'html';
type FieldKey = 'title' | 'category' | 'summary' | 'tags' | 'cover' | 'date';

interface FieldSnapshot {
  title: string;
  category: string;
  description: string;
  draft: boolean;
  tags: string[];
  cover: string;
  date: string;
}

const crepeRoot = ref<HTMLElement | null>(null);
const sourceRoot = ref<HTMLElement | null>(null);
const bodyElement = ref<HTMLElement | null>(null);
const viewState = ref<ViewState>('loading');
const loadError = ref('');
const errorKind = ref<'read' | 'mount'>('read');
const format = ref<ContentFormat>('markdown');
const sourceMode = ref(false);
const inspectorHost = ref(false);

const title = ref('');
const category = ref('');
const summary = ref('');
const tagsText = ref('');
const cover = ref('');
const date = ref('');
const draft = ref(false);
const categoryList = ref<string[]>([]);
const currentSlug = ref(props.slug);
const hasFrontmatter = ref(false);
/** frontmatter 里用 `>` / `|` 多行写法的字段不能在表单里改，否则会把 YAML 改坏。 */
const blockedFields = ref<FieldKey[]>([]);
const summaryKey = ref<'description' | 'summary'>('description');
const charCount = ref(0);

let session: MarkdownSession | undefined;
/** 当前 session 对应的文章身份。props 可能在 flush 之前就变了，写盘必须用这对值。 */
let activeSiteDir = '';
let activeSlug = '';
let crepe: Crepe | undefined;
let crepeReady = false;
let sourceEditor: monaco.editor.IStandaloneCodeEditor | undefined;
let sourceModel: monaco.editor.ITextModel | undefined;
let baseline: FieldSnapshot = {
  title: '',
  category: '',
  description: '',
  draft: false,
  tags: [],
  cover: '',
  date: '',
};
let syncingFields = false;
/** 源码模式打开时的初始文本；用来判断用户是否真的改过源码。 */
let sourceInitial = '';
/** 切到源码后、Monaco 还没创建完的那一刻，保存要用的正文。 */
let pendingSourceText = '';
/** 源码切回所见即所得、Crepe 还没挂载完时暂存的正文，避免这个窗口里切文章丢内容。 */
let pendingVisualText = '';
/** 每次正文/属性变化都自增；保存回来时用它判断期间有没有新的编辑。 */
let editSeq = 0;
/** 正文是否被改过。只改属性时不要把 Crepe 序列化过的正文写回去。 */
let bodyEdited = false;
let saveTimer = 0;
let generation = 0;
let bodyRetries = 0;
let chain: Promise<void> = Promise.resolve();

const modeItems = [
  { key: 'visual', label: '编辑', icon: icons.edit },
  { key: 'source', label: '源码', icon: icons.code },
];

const modeKey = computed({
  get: () => (sourceMode.value ? 'source' : 'visual'),
  set: (value: string) => {
    if (value === 'source') void enterSource();
    else enterVisual();
  },
});

/** HTML 文章直接进 Monaco；Markdown 只有在源码模式才显示 Monaco。 */
const showMonaco = computed(
  () => viewState.value !== 'loading' && (format.value === 'html' || sourceMode.value),
);

const saveTone = computed<'ok' | 'warn' | 'neutral' | 'danger'>(() => {
  switch (sessionStore.saveState) {
    case 'dirty':
      return 'warn';
    case 'saving':
      return 'neutral';
    case 'conflict':
      return 'danger';
    default:
      return 'ok';
  }
});

const saveText = computed(() => {
  switch (sessionStore.saveState) {
    case 'dirty':
      return copy.dirty;
    case 'saving':
      return copy.saving;
    case 'conflict':
      return copy.conflict;
    default:
      return copy.saved;
  }
});

const saveIcon = computed(() => {
  switch (sessionStore.saveState) {
    case 'dirty':
      return icons.edit;
    case 'saving':
      return icons.save;
    case 'conflict':
      return icons.alert;
    default:
      return icons.check;
  }
});

const fieldsEditable = computed(() => hasFrontmatter.value && viewState.value !== 'error');

const showEmptyHint = computed(
  () => format.value === 'markdown' && viewState.value === 'empty' && !sourceMode.value,
);

const errorTitle = computed(() => (errorKind.value === 'mount' ? '编辑器没能加载' : '没能打开这篇'));

const errorHint = computed(() =>
  errorKind.value === 'mount'
    ? `${loadError.value}。点下面的按钮重新加载；正文还在文件里，也可以切到源码模式查看。`
    : `${loadError.value}。文件可能被移动或改名了；回到文章列表刷新后再试，或点下面的按钮重新加载。`,
);

const categoryOptions = computed<{ value: string; label: string }[]>(() => {
  const names = new Set(categoryList.value);
  if (category.value) names.add(category.value);
  const options = [{ value: '', label: '未分类' }];
  for (const name of [...names].sort((left, right) => left.localeCompare(right, 'zh-CN'))) {
    options.push({ value: name, label: name });
  }
  return options;
});

const formatLabel = computed(() => (format.value === 'html' ? 'HTML' : 'Markdown'));

function hintFor(key: FieldKey, normal: string): string {
  if (!hasFrontmatter.value) return '这篇没有 frontmatter，属性改动暂时不会写回文件。';
  if (blockedFields.value.includes(key)) return '这一项在 frontmatter 里是多行写法，请切到源码模式修改。';
  return normal;
}

/* ---------- frontmatter 读取与写回 ---------- */

function scalarValue(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 不是合法 JSON 的 YAML 转义，退回手工去引号。
    }
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** patchFrontmatter 内部用 String.replace 拼接，值里的 `$` 必须转义成 `$$` 才不会当成替换模式。 */
function yamlString(value: string): string {
  return JSON.stringify(value).replace(/\$/g, () => '$$');
}

function yamlJson(value: unknown): string {
  return JSON.stringify(value).replace(/\$/g, () => '$$');
}

function rawField(source: string, key: string): string {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(source);
  return match?.[1]?.trim() ?? '';
}

function readField(source: string, key: string): string {
  return scalarValue(rawField(source, key));
}

/** tags 支持内联 `tags: ["a","b"]` 和块列表 `tags:\n  - a` 两种写法。 */
function readTagList(source: string): string[] {
  const inline = new RegExp(`^tags:[ \\t]*\\[(.*)\\][ \\t]*$`, 'm').exec(source);
  if (inline) {
    return (
      (inline[1] ?? '')
        .match(/"[^"]*"|'[^']*'|[^,]+/g)
        ?.map((row) => scalarValue(row.trim()))
        .filter(Boolean) ?? []
    );
  }
  const block = new RegExp(`^tags:[ \\t]*\\r?\\n((?:[ \\t]+-[^\\r\\n]*(?:\\r?\\n|$))*)`, 'm').exec(source);
  if (!block) return [];
  return (block[1] ?? '')
    .split(/\r?\n/)
    .map((line) => /^[ \t]+-[ \t]*(.*)$/.exec(line)?.[1] ?? '')
    .map((row) => scalarValue(row.trim()))
    .filter(Boolean);
}

/** 改 tags 前先删掉旧块列表，否则 patchFrontmatter 只替换首行会留下孤立列表项。 */
function stripBlockList(frontmatter: string, key: string): string {
  return frontmatter.replace(
    new RegExp(`^${key}:[ \\t]*\\r?\\n(?:[ \\t]+-[^\\r\\n]*(?:\\r?\\n|$))*`, 'm'),
    '',
  );
}

function applyMetaPatch(frontmatter: string, patch: Record<string, string>): string {
  const next = 'tags' in patch ? stripBlockList(frontmatter, 'tags') : frontmatter;
  return patchFrontmatter(next, patch);
}

function detectSummaryKey(frontmatter: string): 'description' | 'summary' {
  if (/^description:/m.test(frontmatter)) return 'description';
  if (/^summary:/m.test(frontmatter)) return 'summary';
  return 'description';
}

function detectBlockedFields(frontmatter: string): FieldKey[] {
  const blocked: FieldKey[] = [];
  const blockedKeys: [FieldKey, string][] = [
    ['title', 'title'],
    ['category', 'category'],
    ['summary', summaryKey.value],
    ['cover', 'cover'],
    ['date', 'date'],
  ];
  for (const [field, key] of blockedKeys) {
    if (/^[>|]/.test(rawField(frontmatter, key))) blocked.push(field);
  }
  return blocked;
}

function countChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function parseTagsText(text: string): string[] {
  const rows = text
    .split(/[,，]/)
    .map((row) => row.trim())
    .filter(Boolean);
  return [...new Set(rows)];
}

function tagsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function snapshotFields(): FieldSnapshot {
  return {
    title: title.value,
    category: category.value,
    description: summary.value,
    draft: draft.value,
    tags: parseTagsText(tagsText.value),
    cover: cover.value,
    date: date.value,
  };
}

/** 只把真正改过的键交给 patchFrontmatter，避免每次保存都重写一遍 frontmatter 的引号。 */
function fieldPatch(fields: FieldSnapshot): Record<string, string> {
  const patch: Record<string, string> = {};
  if (fields.title !== baseline.title) patch.title = yamlString(fields.title);
  if (fields.description !== baseline.description) {
    patch[summaryKey.value] = yamlString(fields.description);
  }
  if (fields.category !== baseline.category) patch.category = yamlString(fields.category);
  if (fields.draft !== baseline.draft) patch.draft = fields.draft ? 'true' : 'false';
  if (!tagsEqual(fields.tags, baseline.tags)) patch.tags = yamlJson(fields.tags);
  if (fields.cover !== baseline.cover) patch.cover = yamlString(fields.cover);
  if (fields.date !== baseline.date) patch.date = yamlString(fields.date);
  return patch;
}

function hasFieldChanges(): boolean {
  return Object.keys(fieldPatch(snapshotFields())).length > 0;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

/* ---------- 保存 ---------- */

function htmlFilePath(slug: string): string {
  return `src/content/posts/${slug}/index.html`;
}

function currentBody(): string | undefined {
  if (format.value === 'html') return sourceEditor ? sourceEditor.getValue() : undefined;
  if (sourceMode.value) return sourceEditor?.getValue() ?? pendingSourceText;
  if (crepeReady && crepe) return crepe.getMarkdown();
  return pendingVisualText || undefined;
}

function scheduleSave(delay = 1000): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    void persist();
  }, delay);
}

function clearSaveTimer(): void {
  window.clearTimeout(saveTimer);
  saveTimer = 0;
}

function enqueue(run: () => Promise<void>): Promise<void> {
  const next = chain.then(run, run);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function touchEdits(): void {
  if (!session) return;
  editSeq += 1;
  session = markDirty(session);
  sessionStore.setSaveState('dirty');
  scheduleSave();
}

function notifySaveFailure(saved: SaveResult): void {
  if (saved.reason === 'GUARDED_BLOCK_EDITED') {
    notify(
      '有受保护的原始格式（链接定义、HTML 或 ::: 容器）被编辑器改动了，已保留磁盘上的原文。请切到源码模式改这一段，或撤销这次改动。',
      'error',
      'editor-save',
    );
    return;
  }
  notify(
    '这次改动没能安全写回：和原文的差异超出了编辑器能保证的范围。请按 Ctrl+S 重试，或切到源码模式逐段修改。',
    'error',
    'editor-save',
  );
}

/** 保存成功（或无需写盘）后统一更新 session / 保存态；写盘期间有新编辑就回到 dirty 继续存。 */
function afterSave(text: string, fields: FieldSnapshot, seq: number): void {
  session = openMarkdown(text);
  baseline = fields;
  if (seq === editSeq) {
    bodyEdited = false;
    sessionStore.setSaveState('saved');
  } else {
    session = markDirty(session);
    sessionStore.setSaveState('dirty');
    scheduleSave();
  }
}

/**
 * 保存顺序上串行执行，避免两次写盘互相覆盖。
 * 正文和属性在调用时同步抓取快照——卸载时 crepe 可能已经被销毁，晚一步就抓不到了。
 */
function persist(): Promise<void> {
  if (!session) return Promise.resolve();
  const body = currentBody();
  if (body === undefined) {
    // 编辑器正在挂载：稍等再存，但别无限重试成死循环。
    if (viewState.value === 'ready' && bodyRetries < 10) {
      bodyRetries += 1;
      scheduleSave(150);
    }
    return Promise.resolve();
  }
  bodyRetries = 0;
  const fields = snapshotFields();
  const patch = fieldPatch(fields);
  const seq = editSeq;
  const bodyChanged = bodyEdited;
  const capturedFormat = format.value;
  const target = { siteDir: activeSiteDir, slug: activeSlug };
  return enqueue(async () => {
    const current = session;
    if (!current) return;
    try {
      if (capturedFormat === 'html') {
        const changed = bodyChanged || Object.keys(patch).length > 0 || current.dirty;
        if (!changed) {
          sessionStore.setSaveState('saved');
          return;
        }
        const text = `${applyMetaPatch(current.fmRaw, patch)}${bodyChanged ? body : current.body}`;
        if (text === current.original) {
          afterSave(text, fields, seq);
          return;
        }
        sessionStore.setSaveState('saving');
        const result = await window.xiao.dev.write(target.siteDir, htmlFilePath(target.slug), text);
        if (!result.ok) {
          sessionStore.setSaveState('dirty');
          notify(
            `保存失败：${result.message}。请确认这篇还在，或按 Ctrl+S 重试；一直失败的话回到文章列表刷新一次。`,
            'error',
            'editor-save',
          );
          return;
        }
        afterSave(text, fields, seq);
        return;
      }
      // Markdown：正文走保真写回层，元数据只 patch 改动键。
      const working: MarkdownSession =
        patch.tags !== undefined ? { ...current, fmRaw: stripBlockList(current.fmRaw, 'tags') } : current;
      const saved = saveMarkdown(working, bodyChanged ? body : current.body, patch);
      if (!saved.write) {
        if (saved.reason === 'clean' || saved.reason === 'unchanged' || saved.reason === 'identical') {
          afterSave(saved.text, fields, seq);
          return;
        }
        sessionStore.setSaveState('dirty');
        notifySaveFailure(saved);
        return;
      }
      sessionStore.setSaveState('saving');
      const result = await window.xiao.content.write(target.siteDir, target.slug, saved.text);
      if (!result.ok) {
        sessionStore.setSaveState('dirty');
        notify(
          `保存失败：${result.message}。请确认这篇还在，或按 Ctrl+S 重试；一直失败的话回到文章列表刷新一次。`,
          'error',
          'editor-save',
        );
        return;
      }
      afterSave(saved.text, fields, seq);
    } catch (error) {
      sessionStore.setSaveState('dirty');
      notify(`保存时出错了：${describeError(error)}。请按 Ctrl+S 重试。`, 'error', 'editor-save');
    }
  });
}

async function flush(): Promise<void> {
  clearSaveTimer();
  if (!session) {
    await chain;
    return;
  }
  if (session.dirty || hasFieldChanges()) await persist();
  else await chain;
}

function saveNow(): void {
  clearSaveTimer();
  void persist();
}

function onSaveShortcut(): void {
  saveNow();
}

/* ---------- 编辑器（Crepe / Monaco） ---------- */

async function destroyEditors(): Promise<void> {
  clearBlockDrag();
  crepeReady = false;
  const current = crepe;
  crepe = undefined;
  if (current) {
    try {
      await current.destroy();
    } catch {
      // Crepe 已经销毁过时不再打断后续清理。
    }
  }
  disposeSource();
}

function disposeSource(): void {
  sourceEditor?.dispose();
  sourceEditor = undefined;
  sourceModel?.dispose();
  sourceModel = undefined;
  pendingSourceText = session?.body ?? '';
  sourceMode.value = false;
}

function resetScroll(): void {
  if (bodyElement.value) bodyElement.value.scrollTop = 0;
}

function focusVisual(): void {
  const editable = crepeRoot.value?.querySelector<HTMLElement>('.ProseMirror');
  editable?.focus();
}

function createMonacoEditor(text: string, language: string): monaco.editor.IStandaloneCodeEditor | undefined {
  const host = sourceRoot.value;
  if (!host) return undefined;
  const model = monaco.editor.createModel(text, language);
  sourceModel = model;
  const editor = monaco.editor.create(host, {
    model,
    automaticLayout: true,
    wordWrap: 'on',
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    padding: { top: 16, bottom: 48 },
    theme: sessionStore.theme === 'dark' ? 'vs-dark' : 'vs',
  });
  model.onDidChangeContent(() => {
    charCount.value = countChars(model.getValue());
    bodyEdited = true;
    touchEdits();
  });
  sourceEditor = editor;
  return editor;
}

async function mountCrepeUnsafe(body: string, gen = generation): Promise<void> {
  await nextTick();
  if (gen !== generation) return;
  const rootElement = crepeRoot.value;
  if (!rootElement) return;
  await destroyEditors();
  if (gen !== generation) return;
  pendingVisualText = body;
  const instance = new Crepe({
    root: rootElement,
    defaultValue: body,
    features: { [Crepe.Feature.Latex]: false },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: '写点什么，或按 / 插入 Markdown 块…' },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: '文本',
          text: { label: '正文' },
          h1: { label: '标题 1' },
          h2: { label: '标题 2' },
          h3: { label: '标题 3' },
          h4: { label: '标题 4' },
          h5: { label: '标题 5' },
          h6: { label: '标题 6' },
          quote: { label: '引用' },
          divider: { label: '分隔线' },
        },
        listGroup: {
          label: '列表',
          bulletList: { label: '无序列表' },
          orderedList: { label: '有序列表' },
          taskList: { label: '待办' },
        },
        advancedGroup: {
          label: '高级',
          image: { label: '图片' },
          codeBlock: { label: '代码块' },
          table: { label: '表格' },
        },
      },
      [Crepe.Feature.ImageBlock]: {
        onUpload: async (file: File) => {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = '';
          bytes.forEach((item) => {
            binary += String.fromCharCode(item);
          });
          const saved = await window.xiao.content.saveImage(
            activeSiteDir,
            activeSlug,
            file.name,
            btoa(binary),
          );
          if (!saved.ok) {
            notify(
              `图片没能保存：${saved.message}。确认文章目录还在后重试，或先把图片放到文章目录里再插入。`,
              'error',
              'editor-image',
            );
            throw new Error(saved.message);
          }
          return saved.data;
        },
        proxyDomURL: (url: string) => {
          if (!url.startsWith('./')) return url;
          const name = encodeURIComponent(url.slice(2));
          const site = encodeURIComponent(activeSiteDir);
          return `xiao-asset://local/${name}?site=${site}&slug=${encodeURIComponent(activeSlug)}`;
        },
      },
    },
  });
  crepe = instance;
  await instance.create();
  if (gen !== generation || crepe !== instance) {
    await instance.destroy();
    return;
  }
  crepeReady = true;
  pendingVisualText = '';
  bodyRetries = 0;
  instance.on((listener) => {
    listener.markdownUpdated((_ctx, markdown) => {
      if (gen !== generation) return;
      charCount.value = countChars(markdown);
      bodyEdited = true;
      touchEdits();
    });
  });
}

/** Crepe 初始化失败时给出中文错误页，内容仍可在源码模式里查看。 */
async function mountCrepe(body: string, gen = generation): Promise<void> {
  try {
    await mountCrepeUnsafe(body, gen);
  } catch (error) {
    const failed = crepe;
    crepe = undefined;
    crepeReady = false;
    if (failed) {
      try {
        await failed.destroy();
      } catch {
        // 半初始化状态下 destroy 也可能失败，忽略即可。
      }
    }
    if (gen !== generation) return;
    errorKind.value = 'mount';
    loadError.value = `所见即所得编辑器没能初始化（${describeError(error)}）`;
    viewState.value = 'error';
    notify(
      '所见即所得编辑器没能初始化。可以点「重新加载」再试，或切到源码模式查看正文。',
      'error',
      'editor-mount',
    );
  }
}

function syncMonacoTheme(): void {
  monaco.editor.setTheme(sessionStore.theme === 'dark' ? 'vs-dark' : 'vs');
}

/** HTML 文章：默认用 Monaco 直接编辑正文（frontmatter 已切走，保存时再拼回去）。 */
async function mountHtmlEditor(text: string, gen = generation): Promise<void> {
  await nextTick();
  if (gen !== generation) return;
  disposeSource();
  createMonacoEditor(text, 'html');
  bodyRetries = 0;
  await nextTick();
  if (gen !== generation) return;
  sourceEditor?.layout();
  sourceEditor?.focus();
}

async function enterSource(): Promise<void> {
  if (!session || format.value !== 'markdown' || sourceMode.value) return;
  const text = currentBody() ?? session.body;
  pendingSourceText = text;
  sourceMode.value = true;
  await nextTick();
  resetScroll();
  if (!session || !sourceMode.value || sourceEditor) return;
  const editor = createMonacoEditor(text, 'markdown');
  sourceInitial = text;
  await nextTick();
  editor?.layout();
  editor?.focus();
}

/**
 * 源码 → 所见即所得：不写盘，只把内容重新交给 Crepe。
 * session.body 始终保留“磁盘上的正文”作为写回基准，否则新改动会被误判成未改。
 */
function enterVisual(): void {
  if (!sourceMode.value) return;
  // Monaco 还没创建就切回来：源码没有任何改动，直接收起源码层。
  if (!sourceEditor) {
    disposeSource();
    return;
  }
  const text = sourceEditor.getValue();
  const edited = text !== sourceInitial;
  disposeSource();
  if (!session) return;
  if (!edited && crepeReady) return; // 源码没改：保留 Crepe 的光标和撤销栈
  if (!edited && text.trim().length === 0) {
    viewState.value = 'empty';
    return;
  }
  viewState.value = 'ready';
  resetScroll();
  void mountCrepe(text);
}

async function beginWriting(): Promise<void> {
  if (!session || viewState.value !== 'empty') return;
  viewState.value = 'ready';
  await mountCrepe(session.body);
  focusVisual();
}

/* ---------- 块拖拽排序（Crepe 自带的拖柄图标没接排序，这里用 ProseMirror 事务补） ---------- */

interface PmNodeLike {
  nodeSize: number;
  type: { name: string };
}

interface PmTrLike {
  delete: (from: number, to: number) => PmTrLike;
  insert: (pos: number, node: unknown) => PmTrLike;
  scrollIntoView: () => PmTrLike;
}

interface PmViewLike {
  state: { doc: { forEach: (fn: (node: PmNodeLike, offset: number) => void) => void }; tr: PmTrLike };
  dispatch: (tr: unknown) => void;
  posAtCoords: (coords: { left: number; top: number }) => { pos: number } | null;
  nodeDOM: (pos: number) => Node | null;
  focus: () => void;
}

interface BlockDrag {
  view: PmViewLike;
  from: number;
  to: number;
  node: PmNodeLike;
  source: HTMLElement | null;
  target: HTMLElement | null;
  targetFrom: number;
  targetTo: number;
  after: boolean;
}

let blockDrag: BlockDrag | null = null;

function proseMirrorView(): PmViewLike | undefined {
  let view: PmViewLike | undefined;
  try {
    crepe?.editor.action((ctx: unknown) => {
      const bag = ctx as { get: (name: string) => unknown };
      view = bag.get('editorView') as PmViewLike | undefined;
    });
  } catch {
    view = undefined;
  }
  return view;
}

function blockAt(view: PmViewLike, pos: number): { from: number; to: number; node: PmNodeLike } | null {
  let found: { from: number; to: number; node: PmNodeLike } | null = null;
  view.state.doc.forEach((node, offset) => {
    if (found) return;
    const end = offset + node.nodeSize;
    if (pos >= offset && pos <= end) found = { from: offset, to: end, node };
  });
  return found;
}

function clearBlockDrop(): void {
  crepeRoot.value
    ?.querySelectorAll('.is-xiao-block-drop-before, .is-xiao-block-drop-after')
    .forEach((el) => el.classList.remove('is-xiao-block-drop-before', 'is-xiao-block-drop-after'));
}

function clearBlockDrag(): void {
  clearBlockDrop();
  crepeRoot.value?.querySelectorAll('.is-xiao-block-drag').forEach((el) => el.classList.remove('is-xiao-block-drag'));
  document.body.classList.remove('xiao-block-dragging');
  blockDrag = null;
}

function onBlockHandleDown(event: PointerEvent): void {
  if (format.value !== 'markdown' || sourceMode.value) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const item = target.closest('.milkdown-block-handle .operation-item');
  if (!(item instanceof HTMLElement) || !item.parentElement) return;
  // Crepe 的块手柄有两个图标：第一个是加号，第二个才是拖柄。
  if (item.parentElement.children[1] !== item) return;
  const view = proseMirrorView();
  if (!view) return;
  const rect = item.getBoundingClientRect();
  const hit = view.posAtCoords({ left: rect.right + 24, top: rect.top + rect.height / 2 });
  if (!hit) return;
  const range = blockAt(view, hit.pos);
  if (!range) return;
  const dom = view.nodeDOM(range.from);
  event.preventDefault();
  event.stopPropagation();
  blockDrag = {
    view,
    ...range,
    source: dom instanceof HTMLElement ? dom : null,
    target: null,
    targetFrom: -1,
    targetTo: -1,
    after: false,
  };
  if (dom instanceof HTMLElement) dom.classList.add('is-xiao-block-drag');
  document.body.classList.add('xiao-block-dragging');
}

function onBlockPointerMove(event: PointerEvent): void {
  const drag = blockDrag;
  if (!drag) return;
  const hit = drag.view.posAtCoords({ left: event.clientX, top: event.clientY });
  clearBlockDrop();
  drag.target = null;
  drag.targetFrom = -1;
  drag.targetTo = -1;
  if (!hit) return;
  const range = blockAt(drag.view, hit.pos);
  if (!range || range.from === drag.from) return;
  const dom = drag.view.nodeDOM(range.from);
  if (!(dom instanceof HTMLElement)) return;
  const rect = dom.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  drag.target = dom;
  drag.targetFrom = range.from;
  drag.targetTo = range.to;
  drag.after = after;
  dom.classList.add(after ? 'is-xiao-block-drop-after' : 'is-xiao-block-drop-before');
}

function onBlockPointerUp(): void {
  const drag = blockDrag;
  if (!drag) return;
  blockDrag = null;
  if (drag.source) drag.source.classList.remove('is-xiao-block-drag');
  document.body.classList.remove('xiao-block-dragging');
  clearBlockDrop();
  if (!drag.target || drag.targetFrom < 0 || drag.targetTo < 0) return;
  if (drag.targetFrom === drag.from) return;
  try {
    let dest = drag.after ? drag.targetTo : drag.targetFrom;
    if (dest > drag.from) dest -= drag.to - drag.from;
    drag.view.dispatch(drag.view.state.tr.delete(drag.from, drag.to).insert(dest, drag.node).scrollIntoView());
    drag.view.focus();
  } catch (error) {
    notify(`块移动失败：${describeError(error)}。可以撤销后重试。`, 'error', 'editor-block-move');
  }
}

/* ---------- 打开 / 关闭 ---------- */

async function loadCategories(siteDir: string, gen: number): Promise<void> {
  let result: IpcResult<{ slug: string; title: string; category: string; draft: boolean }[]>;
  try {
    result = await window.xiao.content.list(siteDir);
  } catch {
    return;
  }
  if (gen !== generation || !result.ok) return;
  const names = new Set<string>();
  for (const item of result.data) {
    if (item.category) names.add(item.category);
  }
  categoryList.value = [...names].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

async function open(): Promise<void> {
  const gen = ++generation;
  const siteDir = props.siteDir;
  const slug = props.slug;
  activeSiteDir = siteDir;
  activeSlug = slug;
  currentSlug.value = slug;
  clearSaveTimer();
  viewState.value = 'loading';
  errorKind.value = 'read';
  loadError.value = '';
  await destroyEditors();
  session = undefined;
  bodyEdited = false;
  pendingVisualText = '';
  hasFrontmatter.value = false;
  blockedFields.value = [];
  if (gen !== generation) return;

  let result: IpcResult<{ text: string; format: ContentFormat }>;
  try {
    result = await window.xiao.content.readPost(siteDir, slug);
  } catch (error) {
    if (gen !== generation) return;
    format.value = 'markdown';
    sourceMode.value = false;
    loadError.value = describeError(error);
    viewState.value = 'error';
    sessionStore.setSaveState('saved');
    return;
  }
  if (gen !== generation) return;
  if (!result.ok) {
    format.value = 'markdown';
    sourceMode.value = false;
    loadError.value = result.message;
    viewState.value = 'error';
    sessionStore.setSaveState('saved');
    return;
  }

  const opened = openMarkdown(result.data.text);
  session = opened;
  format.value = result.data.format;
  hasFrontmatter.value = opened.fmRaw.length > 0;
  summaryKey.value = detectSummaryKey(opened.fmRaw);
  blockedFields.value = detectBlockedFields(opened.fmRaw);

  // 程序化回填字段时不能让 watch 把文件标成 dirty。
  syncingFields = true;
  title.value = readField(opened.fmRaw, 'title');
  category.value = readField(opened.fmRaw, 'category');
  summary.value = readField(opened.fmRaw, summaryKey.value);
  tagsText.value = readTagList(opened.fmRaw).join(', ');
  cover.value = readField(opened.fmRaw, 'cover');
  date.value = readField(opened.fmRaw, 'date');
  draft.value = /^draft:[ \t]*true/m.test(opened.fmRaw);
  baseline = snapshotFields();
  syncingFields = false;

  charCount.value = countChars(opened.body);
  if (format.value === 'html') {
    viewState.value = 'ready';
    sessionStore.setSaveState('saved');
    await nextTick();
    if (gen !== generation) return;
    await mountHtmlEditor(opened.body, gen);
  } else {
    viewState.value = opened.body.trim().length > 0 ? 'ready' : 'empty';
    sessionStore.setSaveState('saved');
    if (viewState.value === 'ready') await mountCrepe(opened.body, gen);
  }
  void loadCategories(siteDir, gen);
}

async function reload(): Promise<void> {
  await flush();
  await open();
}

/* ---------- 顶栏动作 ---------- */

async function openPreview(): Promise<void> {
  sessionStore.setPreviewMode('dock');
  if (sessionStore.previewUrl || sessionStore.building) return;
  sessionStore.building = true;
  try {
    const result = await window.xiao.runtime.start('dev', activeSiteDir || props.siteDir);
    if (!result.ok) {
      notify(
        `预览没能启动：${result.message}。先确认站点依赖已经装好，再点一次「预览」。`,
        'error',
        'editor-preview',
      );
    }
  } catch (error) {
    notify(`预览没能启动：${describeError(error)}。请稍后重试。`, 'error', 'editor-preview');
  } finally {
    sessionStore.building = false;
  }
}

/* ---------- 浮层越界修正 ---------- */

const menuSelector = '.milkdown-slash-menu, .milkdown-toolbar, .milkdown-link-preview, .milkdown-link-edit';
let menuObserver: MutationObserver | undefined;
let menuFrame = 0;

function resetClampedMenu(element: HTMLElement): void {
  delete element.dataset.clamped;
  element.style.position = '';
  element.style.top = '';
  element.style.left = '';
  element.style.right = '';
  element.style.bottom = '';
  element.style.maxHeight = '';
  element.style.zIndex = '';
  const groups = element.querySelector<HTMLElement>('.menu-groups');
  if (groups) groups.style.maxHeight = '';
}

function applyClamp(element: HTMLElement, top: number, left: number): void {
  element.dataset.clamped = '1';
  element.style.position = 'fixed';
  element.style.top = `${top}px`;
  element.style.left = `${left}px`;
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.zIndex = '80';
}

function clampMenus(): void {
  const scope = crepeRoot.value;
  if (!scope) return;
  const margin = 8;
  let retry = false;
  scope.querySelectorAll<HTMLElement>(menuSelector).forEach((element) => {
    if (element.getAttribute('data-show') === 'false') {
      if (!element.dataset.clamped) return;
      resetClampedMenu(element);
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 2) {
      retry = true;
      return;
    }
    let top = rect.top;
    let left = rect.left;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;
    if (element.classList.contains('milkdown-slash-menu')) {
      const tab = element.querySelector<HTMLElement>('.tab-group');
      const groups = element.querySelector<HTMLElement>('.menu-groups');
      const tabHeight = tab ? tab.getBoundingClientRect().height : 0;
      const spaceBelow = window.innerHeight - top - margin;
      const groupsMax = Math.max(160, Math.min(420, spaceBelow - tabHeight));
      if (groups) groups.style.maxHeight = `${Math.round(groupsMax)}px`;
    }
    applyClamp(element, Math.round(top), Math.round(left));
  });
  if (retry) {
    cancelAnimationFrame(menuFrame);
    menuFrame = requestAnimationFrame(clampMenus);
  }
}

function detectInspectorHost(): void {
  inspectorHost.value = Boolean(document.querySelector('#inspector-host'));
}

onMounted(() => {
  window.addEventListener('xiao:save', onSaveShortcut);
  window.addEventListener('resize', clampMenus);
  window.addEventListener('pointermove', onBlockPointerMove);
  window.addEventListener('pointerup', onBlockPointerUp);
  const scope = crepeRoot.value;
  if (scope) {
    scope.addEventListener('pointerdown', onBlockHandleDown);
    menuObserver = new MutationObserver(() => {
      cancelAnimationFrame(menuFrame);
      menuFrame = requestAnimationFrame(clampMenus);
    });
    menuObserver.observe(scope, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-show', 'class', 'style'],
    });
  }
  void nextTick().then(detectInspectorHost);
});

onBeforeUnmount(() => {
  window.removeEventListener('xiao:save', onSaveShortcut);
  window.removeEventListener('resize', clampMenus);
  window.removeEventListener('pointermove', onBlockPointerMove);
  window.removeEventListener('pointerup', onBlockPointerUp);
  crepeRoot.value?.removeEventListener('pointerdown', onBlockHandleDown);
  clearBlockDrag();
  clearSaveTimer();
  cancelAnimationFrame(menuFrame);
  menuObserver?.disconnect();
  generation += 1;
  // 带未保存改动切走/关闭前先 flush；persist 会先同步抓正文再异步写盘。
  if (session && (session.dirty || hasFieldChanges())) void persist();
  void destroyEditors();
});

watch(
  () => sessionStore.inspectorOpen,
  () => {
    // Shell 的 #inspector-host 是 v-if 渲染的；重新打开后要重挂 Teleport，否则属性不会回来。
    inspectorHost.value = false;
    void nextTick().then(detectInspectorHost);
  },
);

watch(
  [title, category, summary, tagsText, cover, date, draft],
  () => {
    if (syncingFields || !session) return;
    touchEdits();
  },
  { flush: 'sync' },
);

watch(
  () => sessionStore.theme,
  () => syncMonacoTheme(),
);

watch(
  () => [props.siteDir, props.slug],
  () => {
    void reload();
  },
  { immediate: true },
);
</script>

<template>
  <div class="editor-view" :class="{ 'is-source': showMonaco }">
    <div class="editor-bar">
      <button
        type="button"
        class="save-chip"
        :class="sessionStore.saveState"
        :disabled="(viewState === 'loading' || viewState === 'error') && !showMonaco"
        :aria-label="`保存状态：${saveText}，点击立即保存`"
        @click="saveNow"
      >
        <UiSpinner v-if="sessionStore.saveState === 'saving'" :size="12" />
        <UiIcon v-else :path="saveIcon" :size="14" />
        <span>{{ saveText }}</span>
      </button>

      <UiBadge :tone="format === 'html' ? 'accent' : 'neutral'">{{ formatLabel }}</UiBadge>

      <div class="bar-grow" />

      <UiSegmented
        v-if="format === 'markdown'"
        v-model="modeKey"
        :items="modeItems"
        aria-label="编辑模式"
      />

      <UiButton variant="primary" :icon="icons.preview" aria-label="打开预览" @click="openPreview">
        <span class="bar-label">预览</span>
      </UiButton>

      <UiTooltip label="版式编辑：下一步支持">
        <UiButton :icon="icons.pages" disabled aria-label="版式（下一步支持）">
          <span class="bar-label">版式</span>
        </UiButton>
      </UiTooltip>
    </div>

    <div ref="bodyElement" class="editor-body">
      <div v-if="viewState === 'loading' && !showMonaco" class="state-loading">
        <UiSpinner :size="20" />
        <p>正在打开这篇…</p>
      </div>

      <div v-else-if="viewState === 'error' && !showMonaco" class="state-panel">
        <UiEmpty :title="errorTitle" :description="errorHint" :icon="icons.alert">
          <template #action>
            <UiButton :icon-left="icons.refresh" @click="reload">重新加载</UiButton>
          </template>
        </UiEmpty>
      </div>

      <div v-else-if="showEmptyHint" class="state-panel">
        <UiEmpty
          title="这篇还没有正文"
          description="从第一段写起；标题、分类、标签等属性可以在右侧检查器里改。"
          :icon="icons.edit"
        >
          <template #action>
            <UiButton variant="primary" :icon-left="icons.edit" @click="beginWriting">开始写第一段</UiButton>
          </template>
        </UiEmpty>
      </div>

      <div
        v-show="format === 'markdown' && viewState === 'ready' && !sourceMode"
        ref="crepeRoot"
        class="crepe"
      />
      <div v-show="showMonaco" ref="sourceRoot" class="source" />
    </div>

    <Teleport v-if="inspectorHost" to="#inspector-host">
      <section class="inspector">
        <header class="inspector-head">
          <h3>文章属性</h3>
          <div class="inspector-head-actions">
            <UiBadge :tone="saveTone" dot>{{ saveText }}</UiBadge>
            <UiTooltip label="收起文章属性">
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.chevronRight"
                aria-label="收起文章属性"
                @click="sessionStore.inspectorOpen = false"
              />
            </UiTooltip>
          </div>
        </header>

        <div class="inspector-body">
          <UiField label="标题" :hint="hintFor('title', '显示在文章顶部和列表里。')">
            <UiInput v-model="title" :disabled="!fieldsEditable" placeholder="给这篇文章起个标题" />
          </UiField>

          <UiField label="分类" :hint="hintFor('category', '用于文章列表里的分类树。')">
            <UiSelect v-model="category" :options="categoryOptions" :disabled="!fieldsEditable" />
          </UiField>

          <UiField label="标签" :hint="hintFor('tags', '用逗号分隔，例如：随笔, 旅行。')">
            <UiInput v-model="tagsText" :disabled="!fieldsEditable" placeholder="随笔, 旅行" />
          </UiField>

          <UiField label="摘要" :hint="hintFor('summary', '一两句话概括这篇，用于列表和搜索结果。')">
            <UiTextarea v-model="summary" :rows="3" :disabled="!fieldsEditable" placeholder="这篇讲了什么？" />
          </UiField>

          <UiField label="封面" :hint="hintFor('cover', '图片地址；留空表示不用封面。')">
            <UiInput v-model="cover" :disabled="!fieldsEditable" placeholder="./cover.jpg 或站内路径" />
          </UiField>

          <UiField
            label="发布日期"
            :hint="hintFor('date', '例如 2026-10-24 00:00:00；留空使用默认排序。')"
          >
            <UiInput v-model="date" :disabled="!fieldsEditable" placeholder="2026-10-24 00:00:00" />
          </UiField>

          <UiField
            label="草稿"
            :hint="draft ? '草稿不会出现在站点里，构建时也跳过。' : '正文会随站点一起构建发布。'"
          >
            <UiSwitch v-model="draft" :disabled="!fieldsEditable" aria-label="草稿状态" />
          </UiField>

          <div class="inspector-meta">
            <div class="meta-row">
              <span class="meta-key">文件标识</span>
              <code class="meta-value">{{ currentSlug }}</code>
            </div>
            <div class="meta-row">
              <span class="meta-key">正文格式</span>
              <span class="meta-value">{{ formatLabel }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-key">正文字数</span>
              <span class="meta-value">{{ charCount }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-key">自动保存</span>
              <span class="meta-value">停手 1 秒后写盘</span>
            </div>
          </div>

          <p v-if="format === 'html'" class="inspector-note inspector-note--info">
            HTML 文章的正文按原样保存；这里的元数据只改 frontmatter，不会重排正文。用「预览」看渲染效果。
          </p>
          <p v-if="viewState !== 'loading' && viewState !== 'error' && !hasFrontmatter" class="inspector-note">
            这篇没有 frontmatter，属性改动暂时不会写回文件；请先切到源码模式补上 frontmatter。
          </p>
        </div>
      </section>
    </Teleport>
  </div>
</template>

<style scoped>
.editor-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.editor-view.is-source .editor-body {
  overflow: hidden;
}

.editor-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s2);
  height: calc(var(--ui-s6) + var(--ui-s5));
  padding: 0 var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  background: var(--ui-panel);
}

.bar-grow {
  flex: 1;
}

.bar-label {
  display: inline;
}

.save-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  height: var(--ui-h-sm);
  padding: 0 var(--ui-s2);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-lg);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--ui-dur) var(--ui-ease),
    border-color var(--ui-dur) var(--ui-ease),
    color var(--ui-dur) var(--ui-ease);
}

.save-chip:hover:not(:disabled) {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.save-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-chip.saved {
  border-color: var(--ui-ok-weak);
  color: var(--ui-ok);
}

.save-chip.dirty {
  border-color: var(--ui-warn-weak);
  color: var(--ui-warn);
}

.save-chip.saving {
  color: var(--ui-accent);
}

.save-chip.conflict {
  border-color: var(--ui-danger-weak);
  color: var(--ui-danger);
}

.editor-body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--ui-bg);
}

.crepe {
  min-height: 100%;
}

.source {
  position: absolute;
  inset: 0;
}

.state-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-s2);
  height: 100%;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.state-panel {
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: var(--ui-s6);
}

/* ---------- Crepe 暗色接入 ---------- */

.crepe :deep(.milkdown) {
  --crepe-color-background: var(--ui-bg);
  --crepe-color-on-background: var(--ui-text);
  --crepe-color-surface: var(--ui-panel);
  --crepe-color-surface-low: var(--ui-raise);
  --crepe-color-on-surface: var(--ui-text);
  --crepe-color-on-surface-variant: var(--ui-text-2);
  --crepe-color-outline: var(--ui-text-3);
  --crepe-color-primary: var(--ui-accent);
  --crepe-color-secondary: var(--ui-hover);
  --crepe-color-on-secondary: var(--ui-text-2);
  --crepe-color-inverse: var(--ui-text);
  --crepe-color-on-inverse: var(--ui-bg);
  --crepe-color-inline-code: var(--ui-accent);
  --crepe-color-error: var(--ui-danger);
  --crepe-color-hover: var(--ui-hover);
  --crepe-color-selected: var(--ui-active);
  --crepe-color-inline-area: var(--ui-raise);
  --crepe-base-font-size: var(--ui-fs-4);
  --crepe-font-default: var(--ui-font);
  --crepe-font-title: var(--ui-font);
  --crepe-font-code: var(--ui-mono);
  --crepe-shadow-1: var(--ui-shadow-1);
  --crepe-shadow-2: var(--ui-shadow-2);

  min-height: 100%;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.crepe :deep(.ProseMirror) {
  box-sizing: border-box;
  max-width: 780px;
  min-height: calc(100vh - 220px);
  margin: 0 auto;
  padding: var(--ui-s5) var(--ui-s6) var(--ui-s8);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-4);
  line-height: var(--ui-lh);
}

.crepe :deep(.ProseMirror:focus),
.crepe :deep(.ProseMirror:focus-visible) {
  outline: none;
}

.crepe :deep(.ProseMirror h1),
.crepe :deep(.ProseMirror h2),
.crepe :deep(.ProseMirror h3),
.crepe :deep(.ProseMirror h4),
.crepe :deep(.ProseMirror h5),
.crepe :deep(.ProseMirror h6) {
  color: var(--ui-text);
}

.crepe :deep(.ProseMirror a) {
  color: var(--ui-accent);
}

.crepe :deep(.ProseMirror code) {
  color: var(--ui-accent);
  font-family: var(--ui-mono);
}

/* 代码块语法高亮用 Crepe 默认的 oneDark，只把行号槽的底色并到 Studio 面板色。 */
.crepe :deep(.milkdown-code-block .cm-gutters) {
  border-right: 0;
  background: var(--ui-panel);
  color: var(--ui-text-3);
}

.crepe :deep(.milkdown-slash-menu[data-show='false']),
.crepe :deep(.milkdown-toolbar[data-show='false']),
.crepe :deep(.milkdown-link-preview[data-show='false']),
.crepe :deep(.milkdown-link-edit[data-show='false']) {
  display: none;
}

.crepe :deep(.milkdown-toolbar[data-show='true']),
.crepe :deep(.milkdown-slash-menu[data-show='true']),
.crepe :deep(.milkdown-link-preview[data-show='true']),
.crepe :deep(.milkdown-link-edit[data-show='true']) {
  z-index: 80;
}

.crepe :deep(.milkdown-slash-menu[data-show='true']) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.crepe :deep(.milkdown-slash-menu .menu-groups) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

/* 块手柄：第二个图标是拖柄；拖拽时给出放置提示。 */
.crepe :deep(.milkdown-block-handle .operation-item:nth-child(2)) {
  cursor: grab;
}

:global(body.xiao-block-dragging) {
  cursor: grabbing;
  user-select: none;
}
.crepe :deep(.is-xiao-block-drag) {
  opacity: 0.45;
}

.crepe :deep(.is-xiao-block-drop-before) {
  box-shadow: inset 0 3px 0 var(--ui-accent);
}

.crepe :deep(.is-xiao-block-drop-after) {
  box-shadow: inset 0 -3px 0 var(--ui-accent);
}

/* ---------- 检查器 ---------- */

.inspector {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: var(--ui-s3) var(--ui-s3) var(--ui-s6);
}

.inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  padding-bottom: var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.inspector-head-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
}

.inspector-head h3 {
  flex: 1;
  min-width: 0;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.inspector-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
  padding-top: var(--ui-s3);
}

.inspector-meta {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding-top: var(--ui-s2);
  border-top: 1px solid var(--ui-line);
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-s2);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.meta-key {
  color: var(--ui-text-3);
}

.meta-value {
  overflow: hidden;
  color: var(--ui-text-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

code.meta-value {
  font-size: var(--ui-fs-1);
}

.inspector-note {
  padding: var(--ui-s2);
  border: 1px solid var(--ui-warn-weak);
  border-radius: var(--ui-r-sm);
  color: var(--ui-warn);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.inspector-note--info {
  border-color: var(--ui-line);
  color: var(--ui-text-2);
}

@media (max-width: 1180px) {
  .bar-label {
    display: none;
  }

  .save-chip span {
    display: none;
  }
}
</style>
