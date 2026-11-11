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
import { htmlPostFileOf } from '@xiao/core/site';
import { installMonaco } from '../monaco-setup.ts';
import { layoutFileOf, useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
  UiDialog,
  UiEmpty,
  UiField,
  UiIcon,
  UiInput,
  UiPopover,
  UiSelect,
  UiSpinner,
  UiSwitch,
  UiTextarea,
  UiTooltip,
} from '../ui/index.ts';
import WorkbenchBar from './WorkbenchBar.vue';
import HtmlArticleEditor from './HtmlArticleEditor.vue';

installMonaco();

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
  standalone: boolean;
  tags: string[];
  cover: string;
  date: string;
}

const crepeRoot = ref<HTMLElement | null>(null);
const sourceRoot = ref<HTMLElement | null>(null);
const htmlEditor = ref<InstanceType<typeof HtmlArticleEditor> | null>(null);
const htmlSeed = ref('');
const htmlKey = ref(0);
const bodyElement = ref<HTMLElement | null>(null);
const viewState = ref<ViewState>('loading');
const loadError = ref('');
const errorKind = ref<'read' | 'mount'>('read');
const format = ref<ContentFormat>('markdown');
const sourceMode = ref(false);
const inspectorHost = ref(false);

/* 格式转换（显式单向操作） */
const convertOpen = ref(false);
const converting = ref(false);
const convertTarget = ref<ContentFormat>('html');
const convertBody = ref('');
const convertStats = ref<ConvertStats | null>(null);
const convertLosses = ref<string[]>([]);
const convertError = ref('');
let pendingConvertSlug = '';

/* 文章版式（P2）：生成/复用 src/layouts/posts/<slug>.astro 后进画布编辑 */
const layoutBusy = ref(false);
const layoutConfirmOpen = ref(false);
const layoutPath = computed(() => layoutFileOf(props.slug));

const title = ref('');
const category = ref('');
const summary = ref('');
const tagsText = ref('');
const cover = ref('');
const date = ref('');
const draft = ref(false);
const standalone = ref(false);
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
  standalone: false,
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

const workbenchMode = computed({
  get: () => (sourceMode.value ? 'source' : 'visual'),
  set: (value: 'visual' | 'source') => {
    if (value === 'source') void enterSource();
    else enterVisual();
  },
});

/** 两种格式都是：编辑 = 可视化，源码 = Monaco。 */
const showMonaco = computed(() => viewState.value !== 'loading' && sourceMode.value);

const showHtmlVisual = computed(
  () => format.value === 'html' && viewState.value === 'ready' && !sourceMode.value,
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

const fieldsEditable = computed(() => hasFrontmatter.value && viewState.value !== 'error');

const showEmptyHint = computed(() => viewState.value === 'empty' && !sourceMode.value);

const errorTitle = computed(() =>
  errorKind.value === 'mount' ? '编辑器没能加载' : '没能打开这篇',
);

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
  if (blockedFields.value.includes(key))
    return '这一项在 frontmatter 里是多行写法，请切到源码模式修改。';
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
  const block = new RegExp(`^tags:[ \\t]*\\r?\\n((?:[ \\t]+-[^\\r\\n]*(?:\\r?\\n|$))*)`, 'm').exec(
    source,
  );
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
    standalone: standalone.value,
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
  if (fields.standalone !== baseline.standalone) {
    patch.standalone = fields.standalone ? 'true' : 'false';
  }
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
  if (format.value === 'html') {
    if (sourceMode.value) return sourceEditor?.getValue() ?? pendingSourceText;
    if (htmlEditor.value) return htmlEditor.value.getHtml();
    return pendingVisualText || undefined;
  }
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
        patch.tags !== undefined
          ? { ...current, fmRaw: stripBlockList(current.fmRaw, 'tags') }
          : current;
      const saved = saveMarkdown(working, bodyChanged ? body : current.body, patch);
      if (!saved.write) {
        if (
          saved.reason === 'clean' ||
          saved.reason === 'unchanged' ||
          saved.reason === 'identical'
        ) {
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
  sessionStore.setWorkbenchSource(false);
}

function resetScroll(): void {
  if (bodyElement.value) bodyElement.value.scrollTop = 0;
}

function focusVisual(): void {
  const editable = crepeRoot.value?.querySelector<HTMLElement>('.ProseMirror');
  editable?.focus();
}

function createMonacoEditor(
  text: string,
  language: string,
): monaco.editor.IStandaloneCodeEditor | undefined {
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

async function mountHtmlVisual(text: string, gen = generation): Promise<void> {
  await nextTick();
  if (gen !== generation) return;
  htmlSeed.value = text;
  htmlKey.value += 1;
  pendingVisualText = text;
  bodyRetries = 0;
  charCount.value = countChars(text.replace(/<[^>]+>/g, ' '));
  await nextTick();
  pendingVisualText = '';
}

function onHtmlChange(text: string): void {
  if (!session) return;
  charCount.value = countChars(text);
  bodyEdited = true;
  touchEdits();
}

async function enterSource(): Promise<void> {
  if (!session || sourceMode.value) return;
  const text = bodyEdited ? (currentBody() ?? session.body) : session.body;
  pendingSourceText = text;
  sourceMode.value = true;
  sessionStore.setWorkbenchSource(true);
  await nextTick();
  resetScroll();
  if (!session || !sourceMode.value || sourceEditor) return;
  const editor = createMonacoEditor(text, format.value === 'html' ? 'html' : 'markdown');
  sourceInitial = text;
  await nextTick();
  editor?.layout();
  editor?.focus();
}

/**
 * 源码 → 所见即所得：不写盘，只把内容重新交给可视化层。
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
  if (format.value === 'html') {
    if (!edited && text.trim().length === 0) {
      viewState.value = 'empty';
      return;
    }
    viewState.value = 'ready';
    resetScroll();
    if (edited) bodyEdited = true;
    void mountHtmlVisual(text);
    return;
  }
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
  if (format.value === 'html') {
    const seed = session.body.trim() ? session.body : '<p></p>';
    await mountHtmlVisual(seed);
    return;
  }
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
  state: {
    doc: { forEach: (fn: (node: PmNodeLike, offset: number) => void) => void };
    tr: PmTrLike;
  };
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

function blockAt(
  view: PmViewLike,
  pos: number,
): { from: number; to: number; node: PmNodeLike } | null {
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
  crepeRoot.value
    ?.querySelectorAll('.is-xiao-block-drag')
    .forEach((el) => el.classList.remove('is-xiao-block-drag'));
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
    drag.view.dispatch(
      drag.view.state.tr.delete(drag.from, drag.to).insert(dest, drag.node).scrollIntoView(),
    );
    drag.view.focus();
  } catch (error) {
    notify(`块移动失败：${describeError(error)}。可以撤销后重试。`, 'error', 'editor-block-move');
  }
}

/* #region convert-helpers */

interface ConvertStats {
  kept: number;
  html: number;
  dropped: number;
}

interface MarkdownConversion {
  markdown: string;
  stats: ConvertStats;
  losses: string[];
}

interface HNode {
  type: 'element' | 'text' | 'comment';
  tag?: string;
  attrs?: { name: string; value: string }[];
  children?: HNode[];
  text?: string;
}

const CONVERT_DROP_TAGS = new Set([
  'script',
  'style',
  'link',
  'meta',
  'base',
  'template',
  'noscript',
]);
const CONVERT_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const CONVERT_CONTAINER_TAGS = new Set([
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'nav',
  'aside',
]);
/** 编辑器 UI（块手柄/菜单/浮动工具栏等）在 Markdown→HTML 时要整棵丢掉。 */
const SANITIZE_UI_CLASSES = [
  'milkdown-block-handle',
  'milkdown-toolbar',
  'milkdown-slash-menu',
  'milkdown-link-preview',
  'milkdown-link-edit',
  'milkdown-top-bar',
  'crepe-drop-cursor',
  'ProseMirror-gapcursor',
];
const SANITIZE_CLASS_PREFIX = /^(ProseMirror|crepe-|milkdown-|is-selected|is-drag|is-drop)/;

function attrOf(node: HNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function classTokens(node: HNode): string[] {
  return (attrOf(node, 'class') ?? '').split(/\s+/).filter(Boolean);
}

function nodeText(node: HNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'comment') return '';
  return (node.children ?? []).map((child) => nodeText(child)).join('');
}

function elementAttrs(el: Element): { name: string; value: string }[] {
  const rows: { name: string; value: string }[] = [];
  const attrs = el.attributes;
  for (let index = 0; index < attrs.length; index += 1) {
    const item = attrs.item(index);
    if (item) rows.push({ name: item.name.toLowerCase(), value: item.value });
  }
  return rows;
}

function domChildren(node: Node): HNode[] {
  const rows: HNode[] = [];
  const children = node.childNodes;
  for (let index = 0; index < children.length; index += 1) {
    const child = children.item(index);
    if (!child) continue;
    if (child.nodeType === 3) {
      const text = child.nodeValue ?? '';
      if (text) rows.push({ type: 'text', text });
      continue;
    }
    if (child.nodeType === 8) {
      rows.push({ type: 'comment' });
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    rows.push({
      type: 'element',
      tag: el.tagName.toLowerCase(),
      attrs: elementAttrs(el),
      children: domChildren(el),
    });
  }
  return rows;
}

function parseHtmlNodes(html: string): HNode[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return domChildren(doc.body);
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function serializeHNode(node: HNode): string {
  if (node.type === 'comment') return '';
  if (node.type === 'text') return escapeHtmlText(node.text ?? '');
  const tag = node.tag ?? '';
  if (!tag) return serializeHNodes(node.children ?? []);
  const attrs = (node.attrs ?? [])
    .filter((item) => item.value !== '')
    .map((item) => ` ${item.name}="${escapeHtmlAttr(item.value)}"`)
    .join('');
  const open = `<${tag}${attrs}>`;
  if (CONVERT_VOID_TAGS.has(tag)) return open;
  return `${open}${serializeHNodes(node.children ?? [])}</${tag}>`;
}

function serializeHNodes(nodes: HNode[]): string {
  return nodes.map((node) => serializeHNode(node)).join('');
}

function collectNodes(
  node: HNode,
  predicate: (item: HNode) => boolean,
  out: HNode[] = [],
): HNode[] {
  if (node.type !== 'element') return out;
  if (predicate(node)) out.push(node);
  for (const child of node.children ?? []) collectNodes(child, predicate, out);
  return out;
}

function findNode(node: HNode, predicate: (item: HNode) => boolean): HNode | undefined {
  return collectNodes(node, predicate)[0];
}

function findTag(node: HNode, tag: string): HNode | undefined {
  return findNode(node, (item) => (item.tag ?? '').toLowerCase() === tag);
}

function findClass(node: HNode, className: string): HNode | undefined {
  return findNode(node, (item) => classTokens(item).includes(className));
}

function normalizeImageSrc(src: string): string {
  const value = src.trim();
  if (!value.startsWith('xiao-asset://')) return value;
  try {
    const url = new URL(value);
    const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
    return name ? `./${name}` : value;
  } catch {
    return value;
  }
}

function languageOf(node: HNode): string {
  const direct = attrOf(node, 'data-language');
  if (direct) return direct;
  const hit = classTokens(node).find((item) => item.startsWith('language-'));
  return hit ? hit.slice('language-'.length) : '';
}

/** Crepe 的代码块是 CodeMirror 节点视图，从 DOM 里还原成 <pre><code class="language-x">。 */
function codeBlockToPre(node: HNode): HNode {
  const lines = collectNodes(node, (item) => classTokens(item).includes('cm-line')).map((item) =>
    nodeText(item),
  );
  const text = lines.length > 0 ? lines.join('\n') : nodeText(node);
  const languageNode = collectNodes(node, (item) => Boolean(languageOf(item)))[0];
  const language = languageNode ? languageOf(languageNode) : languageOf(node);
  return {
    type: 'element',
    tag: 'pre',
    children: [
      {
        type: 'element',
        tag: 'code',
        attrs: language ? [{ name: 'class', value: `language-${language}` }] : [],
        children: [{ type: 'text', text }],
      },
    ],
  };
}

function listItemContent(node: HNode): HNode[] {
  const box = findClass(node, 'children');
  return box?.children ?? node.children ?? [];
}

function sanitizeElement(node: HNode): HNode | null {
  const tag = (node.tag ?? '').toLowerCase();
  if (!tag) return null;
  if (CONVERT_DROP_TAGS.has(tag)) return null;
  if (['input', 'textarea', 'select', 'option', 'button'].includes(tag)) return null;
  const classes = classTokens(node);
  if (SANITIZE_UI_CLASSES.some((name) => classes.includes(name))) return null;
  if (tag === 'svg') return null;
  if (classes.includes('milkdown-code-block')) return codeBlockToPre(node);
  if (classes.includes('milkdown-image-block')) {
    const img = findTag(node, 'img');
    return img ? sanitizeElement(img) : null;
  }
  if (classes.includes('milkdown-table-block')) {
    return { type: 'element', tag: 'div', children: sanitizeNodes(node.children ?? []) };
  }
  const attrs: { name: string; value: string }[] = [];
  for (const attr of node.attrs ?? []) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) continue;
    if (['contenteditable', 'spellcheck', 'draggable', 'translate', 'style'].includes(name))
      continue;
    if (name.startsWith('data-')) continue;
    if (name === 'class') {
      const kept = attr.value
        .split(/\s+/)
        .filter((token) => token && !SANITIZE_CLASS_PREFIX.test(token));
      if (kept.length > 0) attrs.push({ name: 'class', value: kept.join(' ') });
      continue;
    }
    if (!attr.value) continue;
    if (name === 'src') {
      attrs.push({ name, value: normalizeImageSrc(attr.value) });
      continue;
    }
    attrs.push({ name, value: attr.value });
  }
  const outChildren = sanitizeNodes(node.children ?? []);
  // 编辑器自己的包装 div/span 清掉 class 后会变成空壳，转换时一并丢弃；
  // 用户自己写的空 div 带 class 的会保留（可能是有意的占位/锚点）。
  const hadClass = (node.attrs ?? []).some((attr) => attr.name.toLowerCase() === 'class');
  const keptClass = attrs.some((attr) => attr.name === 'class');
  if ((tag === 'div' || tag === 'span') && hadClass && !keptClass && outChildren.length === 0) {
    return null;
  }
  return { type: 'element', tag, attrs, children: outChildren };
}

function sanitizeNodes(nodes: HNode[]): HNode[] {
  const out: HNode[] = [];
  let list: HNode[] | null = null;
  const flushList = (): void => {
    if (list) {
      out.push({ type: 'element', tag: 'ul', children: list });
      list = null;
    }
  };
  for (const node of nodes) {
    if (node.type === 'comment') continue;
    if (node.type === 'text') {
      out.push(node);
      continue;
    }
    const classes = classTokens(node);
    // Crepe 的列表项节点视图：连续项归并成 <ul><li>，嵌套列表会落在 li 里。
    if (classes.includes('milkdown-list-item-block')) {
      if (!list) list = [];
      list.push({ type: 'element', tag: 'li', children: sanitizeNodes(listItemContent(node)) });
      continue;
    }
    flushList();
    const clean = sanitizeElement(node);
    if (clean) out.push(clean);
  }
  flushList();
  return out;
}

/** 把 ProseMirror 的 innerHTML 清洗成可写进 HTML 文章的正文。 */
function sanitizeArticleHtml(html: string): string {
  return serializeHNodes(sanitizeNodes(parseHtmlNodes(html))).trim();
}

function wrapArticleHtml(body: string): string {
  return `<article class="x-post">\n${body.trim()}\n</article>`;
}

function noteLoss(losses: Map<string, number>, label: string): void {
  losses.set(label, (losses.get(label) ?? 0) + 1);
}

function lossLines(losses: Map<string, number>): string[] {
  return [...losses.entries()].map(([label, count]) => `${label} ×${count}`);
}

function noteExtraAttrs(
  node: HNode,
  allowed: readonly string[],
  losses: Map<string, number>,
): void {
  if ((node.attrs ?? []).some((attr) => !allowed.includes(attr.name))) {
    noteLoss(losses, '部分元素属性（class/style/data-* 等）未迁移');
  }
}

function mdEscapeText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/([\\`*_[\]])/g, '\\$1');
}

function inlineCodeMarkdown(text: string): string {
  const value = text.replace(/\s+/g, ' ').trim() || ' ';
  const longest = (value.match(/`+/g) ?? []).reduce((max, item) => Math.max(max, item.length), 0);
  const fence = '`'.repeat(longest + 1);
  const pad = longest > 0 ? ' ' : '';
  return `${fence}${pad}${value}${pad}${fence}`;
}

function imageMarkdown(node: HNode, stats: ConvertStats, losses: Map<string, number>): string {
  const src = normalizeImageSrc(attrOf(node, 'src') ?? '');
  if (!src) {
    stats.dropped += 1;
    noteLoss(losses, '图片缺少 src 已丢弃');
    return '';
  }
  stats.kept += 1;
  noteExtraAttrs(node, ['src', 'alt', 'title'], losses);
  const alt = mdEscapeText(attrOf(node, 'alt') ?? '');
  const title = attrOf(node, 'title');
  const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
  return `![${alt}](${src}${titlePart})`;
}

function inlineToMarkdown(
  nodes: HNode[],
  stats: ConvertStats,
  losses: Map<string, number>,
): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += mdEscapeText(node.text ?? '');
      continue;
    }
    if (node.type === 'comment') {
      stats.dropped += 1;
      noteLoss(losses, 'HTML 注释已丢弃');
      continue;
    }
    const tag = (node.tag ?? '').toLowerCase();
    const children = node.children ?? [];
    switch (tag) {
      case 'b':
      case 'strong':
        stats.kept += 1;
        noteExtraAttrs(node, [], losses);
        out += `**${inlineToMarkdown(children, stats, losses)}**`;
        break;
      case 'i':
      case 'em':
        stats.kept += 1;
        noteExtraAttrs(node, [], losses);
        out += `*${inlineToMarkdown(children, stats, losses)}*`;
        break;
      case 'code':
        stats.kept += 1;
        out += inlineCodeMarkdown(nodeText(node));
        break;
      case 'a': {
        stats.kept += 1;
        noteExtraAttrs(node, ['href', 'title'], losses);
        const href = attrOf(node, 'href') ?? '';
        const label = inlineToMarkdown(children, stats, losses).trim() || mdEscapeText(href);
        out += href ? `[${label}](${href})` : label;
        break;
      }
      case 'img':
        out += imageMarkdown(node, stats, losses);
        break;
      case 'br':
        out += '  \n';
        break;
      case 'del':
      case 's':
      case 'strike':
        stats.kept += 1;
        out += `~~${inlineToMarkdown(children, stats, losses)}~~`;
        break;
      case 'span':
      case 'u':
      case 'p':
        stats.kept += 1;
        out += inlineToMarkdown(children, stats, losses);
        break;
      case 'input':
        stats.dropped += 1;
        noteLoss(losses, '表单控件已丢弃');
        break;
      case 'script':
      case 'style':
      case 'link':
      case 'meta':
      case 'template':
      case 'noscript':
        stats.dropped += 1;
        noteLoss(losses, `丢弃 <${tag}>`);
        break;
      default: {
        if (!tag) {
          out += inlineToMarkdown(children, stats, losses);
          break;
        }
        stats.html += 1;
        noteLoss(losses, `保留 <${tag}> 为 HTML`);
        out += serializeHNode(node);
      }
    }
  }
  return out;
}

function listToMarkdown(
  node: HNode,
  ordered: boolean,
  stats: ConvertStats,
  losses: Map<string, number>,
  depth: number,
): string {
  const lines: string[] = [];
  let index = 1;
  for (const child of node.children ?? []) {
    if ((child.tag ?? '').toLowerCase() !== 'li') continue;
    stats.kept += 1;
    const inlineNodes: HNode[] = [];
    const nested: HNode[] = [];
    for (const item of child.children ?? []) {
      if (['ul', 'ol'].includes((item.tag ?? '').toLowerCase())) nested.push(item);
      else inlineNodes.push(item);
    }
    const checkbox = findNode(
      child,
      (item) => (item.tag ?? '').toLowerCase() === 'input' && attrOf(item, 'type') === 'checkbox',
    );
    let text = inlineToMarkdown(inlineNodes, stats, losses).replace(/\s+/g, ' ').trim();
    if (checkbox) text = `[${attrOf(checkbox, 'checked') !== undefined ? 'x' : ' '}] ${text}`;
    const marker = ordered ? `${index}.` : '-';
    lines.push(`${'  '.repeat(depth)}${marker} ${text}`.trimEnd());
    for (const item of nested) {
      lines.push(
        listToMarkdown(item, (item.tag ?? '').toLowerCase() === 'ol', stats, losses, depth + 1),
      );
    }
    index += 1;
  }
  return lines.join('\n');
}

function cellAlign(node: HNode): string {
  const value = (attrOf(node, 'align') ?? '').toLowerCase();
  const style = attrOf(node, 'style') ?? '';
  const match = /text-align\s*:\s*(left|center|right)/i.exec(style);
  const align = (match?.[1] ?? value).toLowerCase();
  if (align === 'left') return ':--';
  if (align === 'center') return ':--:';
  if (align === 'right') return '--:';
  return '---';
}

function tableToMarkdown(node: HNode, stats: ConvertStats, losses: Map<string, number>): string {
  const rows = collectNodes(node, (item) => (item.tag ?? '').toLowerCase() === 'tr')
    .map((row) => ({
      cells: (row.children ?? []).filter((cell) =>
        ['th', 'td'].includes((cell.tag ?? '').toLowerCase()),
      ),
    }))
    .filter((row) => row.cells.length > 0);
  const headerRow =
    rows.find((row) => row.cells.some((cell) => (cell.tag ?? '').toLowerCase() === 'th')) ??
    rows[0];
  if (!headerRow) return '';
  if (!rows.some((row) => row.cells.some((cell) => (cell.tag ?? '').toLowerCase() === 'th'))) {
    noteLoss(losses, '表格没有表头，首行被当作表头');
  }
  stats.kept += 1;
  const cellText = (cell: HNode): string =>
    inlineToMarkdown(cell.children ?? [], stats, losses)
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
      .trim();
  const headerCells = headerRow.cells.map((cell) => cellText(cell));
  const lines = [
    `| ${headerCells.join(' | ')} |`,
    `| ${headerRow.cells.map((cell) => cellAlign(cell)).join(' | ')} |`,
  ];
  for (const row of rows) {
    if (row === headerRow) continue;
    const cells = row.cells.map((cell) => cellText(cell));
    while (cells.length < headerCells.length) cells.push('');
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function codeFence(node: HNode): string {
  const codeNode = findTag(node, 'code') ?? node;
  const raw = nodeText(codeNode).replace(/\n+$/, '');
  const language = languageOf(codeNode) || languageOf(node);
  const longest = (raw.match(/`+/g) ?? []).reduce((max, item) => Math.max(max, item.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${raw}\n${fence}`;
}

function blocksToMarkdown(
  nodes: HNode[],
  stats: ConvertStats,
  losses: Map<string, number>,
  depth = 0,
): string {
  const parts: string[] = [];
  const push = (value: string): void => {
    const text = value.trim();
    if (text) parts.push(text);
  };
  for (const node of nodes) {
    if (node.type === 'text') {
      const text = mdEscapeText(node.text ?? '').trim();
      if (text) push(text);
      continue;
    }
    if (node.type === 'comment') {
      stats.dropped += 1;
      noteLoss(losses, 'HTML 注释已丢弃');
      continue;
    }
    const tag = (node.tag ?? '').toLowerCase();
    const children = node.children ?? [];
    if (/^h[1-6]$/.test(tag)) {
      stats.kept += 1;
      noteExtraAttrs(node, [], losses);
      const level = Number(tag.slice(1));
      push(`${'#'.repeat(level)} ${inlineToMarkdown(children, stats, losses).trim()}`);
      continue;
    }
    switch (tag) {
      case 'p':
        stats.kept += 1;
        noteExtraAttrs(node, [], losses);
        push(inlineToMarkdown(children, stats, losses));
        break;
      case 'ul':
      case 'ol':
        push(listToMarkdown(node, tag === 'ol', stats, losses, depth));
        break;
      case 'blockquote': {
        stats.kept += 1;
        const inner = blocksToMarkdown(children, stats, losses, depth);
        push(
          inner
            .split('\n')
            .map((line) => (line ? `> ${line}` : '>'))
            .join('\n'),
        );
        break;
      }
      case 'pre':
        stats.kept += 1;
        push(codeFence(node));
        break;
      case 'hr':
        stats.kept += 1;
        push('---');
        break;
      case 'table':
        push(tableToMarkdown(node, stats, losses));
        break;
      case 'img':
        push(imageMarkdown(node, stats, losses));
        break;
      case 'br':
        break;
      case 'figure': {
        stats.kept += 1;
        const img = findTag(node, 'img');
        const caption = findTag(node, 'figcaption');
        if (img) push(imageMarkdown(img, stats, losses));
        if (caption) push(inlineToMarkdown(caption.children ?? [], stats, losses));
        if (!img && !caption) push(blocksToMarkdown(children, stats, losses, depth));
        break;
      }
      case 'input':
        stats.dropped += 1;
        noteLoss(losses, '表单控件已丢弃');
        break;
      case 'script':
      case 'style':
      case 'link':
      case 'meta':
      case 'base':
      case 'template':
      case 'noscript':
        stats.dropped += 1;
        noteLoss(losses, `丢弃 <${tag}>`);
        break;
      default: {
        if (CONVERT_CONTAINER_TAGS.has(tag)) {
          stats.kept += 1;
          noteExtraAttrs(node, [], losses);
          push(blocksToMarkdown(children, stats, losses, depth));
          break;
        }
        if (!tag) {
          push(blocksToMarkdown(children, stats, losses, depth));
          break;
        }
        const inlineText = inlineToMarkdown([node], stats, losses).trim();
        if (inlineText) push(inlineText);
      }
    }
  }
  return parts.join('\n\n');
}

/** HTML → Markdown：结构化内容转 Markdown，表达不了的保留为内嵌 HTML，丢弃不安全节点并统计。 */
function convertHtmlToMarkdown(html: string): MarkdownConversion {
  const stats: ConvertStats = { kept: 0, html: 0, dropped: 0 };
  const losses = new Map<string, number>();
  const nodes = parseHtmlNodes(html);
  let markdown = blocksToMarkdown(nodes, stats, losses);
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  return {
    markdown: markdown ? `${markdown}\n` : '',
    stats,
    losses: lossLines(losses),
  };
}

/* #endregion convert-helpers */

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
    if (pendingConvertSlug === slug) pendingConvertSlug = '';
    loadError.value = describeError(error);
    viewState.value = 'error';
    sessionStore.setSaveState('saved');
    return;
  }
  if (gen !== generation) return;
  if (!result.ok) {
    format.value = 'markdown';
    sourceMode.value = false;
    if (pendingConvertSlug === slug) pendingConvertSlug = '';
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
  sourceMode.value = false;
  if (format.value === 'html') {
    viewState.value = opened.body.trim().length > 0 ? 'ready' : 'empty';
    sessionStore.setSaveState('saved');
    if (viewState.value === 'ready') await mountHtmlVisual(opened.body, gen);
  } else {
    viewState.value = opened.body.trim().length > 0 ? 'ready' : 'empty';
    sessionStore.setSaveState('saved');
    if (viewState.value === 'ready') await mountCrepe(opened.body, gen);
  }
  void loadCategories(siteDir, gen);
  if (pendingConvertSlug === slug) {
    pendingConvertSlug = '';
    void nextTick().then(() => openConvertDialog());
  }
}

async function reload(): Promise<void> {
  await flush();
  await open();
}

/* ---------- 顶栏动作 ---------- */

async function openPreview(): Promise<void> {
  if (!props.slug) {
    notify('先选一篇文章再预览。', 'error', 'editor-preview');
    return;
  }
  await flush();
  window.dispatchEvent(
    new CustomEvent('xiao:preview-window', {
      detail: { path: `posts/${encodeURIComponent(props.slug)}/` },
    }),
  );
}

/* ---------- 文章版式（P2） ---------- */

/**
 * 点「版式」：先把写作层未保存的改动写盘，再决定是复用已有布局还是确认生成。
 * 画布仍留在「文章」导航，不切到「页面」。布局不存在时不静默创建。
 */
async function openPostLayout(): Promise<void> {
  if (!props.siteDir || !props.slug || layoutBusy.value) return;
  await flush();
  if (sessionStore.saveState === 'dirty' || sessionStore.saveState === 'conflict') {
    notify('正文还没保存成功，先按 Ctrl+S 处理掉保存问题，再打开版式。', 'error', 'editor-layout');
    return;
  }
  const existing = await window.xiao.dev.read(props.siteDir, layoutPath.value);
  if (!existing.ok) {
    layoutConfirmOpen.value = true;
    return;
  }
  await enterPostLayout();
}

async function enterPostLayout(): Promise<void> {
  if (!props.siteDir || !props.slug || layoutBusy.value) return;
  layoutBusy.value = true;
  try {
    const result = await window.xiao.content.customize(props.siteDir, props.slug);
    if (!result.ok) {
      notify(
        `没能生成版式：${result.message}。确认站点里有 src/layouts/PostLayout.astro 且含 <slot /> 后重试。`,
        'error',
        'editor-layout',
      );
      return;
    }
    sessionStore.openLayout(props.slug, title.value.trim() || props.slug);
    sessionStore.setPage(result.data);
    notify(
      '已打开这篇文章的版式：改动只写回这篇的布局文件，其他文章仍用默认版式。',
      'info',
      'editor-layout',
    );
  } catch (error) {
    notify(`打开版式失败：${describeError(error)}。请稍后重试。`, 'error', 'editor-layout');
  } finally {
    layoutBusy.value = false;
  }
}

function confirmPostLayout(): void {
  layoutConfirmOpen.value = false;
  void enterPostLayout();
}

/* ---------- 格式转换（显式单向，先备份再换文件） ---------- */

async function waitForVisual(): Promise<boolean> {
  if (!sourceMode.value && crepeReady) return true;
  if (sourceMode.value) enterVisual();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (crepeReady) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return crepeReady;
}

/** 从编辑器 DOM 还原正文：克隆 → 清洗编辑器装饰 → 包一层 <article class="x-post">。 */
function collectMarkdownArticleHtml(): string {
  const prosemirror = crepeRoot.value?.querySelector<HTMLElement>('.ProseMirror');
  if (!prosemirror) return '';
  const clone = prosemirror.cloneNode(true) as HTMLElement;
  return wrapArticleHtml(sanitizeArticleHtml(clone.innerHTML));
}

function currentHtmlBody(): string {
  if (format.value !== 'html') return session?.body ?? '';
  if (!bodyEdited) return session?.body ?? '';
  return currentBody() ?? session?.body ?? '';
}

function requestConversion(): void {
  void openConvertDialog();
}

async function openConvertDialog(): Promise<void> {
  if (!session || converting.value) return;
  if (viewState.value !== 'ready') {
    notify('文章还没加载完，等正文出现后再转换。', 'error', 'editor-convert');
    return;
  }
  const target: ContentFormat = format.value === 'markdown' ? 'html' : 'markdown';
  convertError.value = '';
  convertStats.value = null;
  convertLosses.value = [];
  if (target === 'html') {
    const ready = await waitForVisual();
    if (!ready) {
      notify('编辑器还没准备好，等正文出现后再试。', 'error', 'editor-convert');
      return;
    }
    const body = collectMarkdownArticleHtml();
    if (!body.trim()) {
      notify('正文为空，不能转换。', 'error', 'editor-convert');
      return;
    }
    convertTarget.value = 'html';
    convertBody.value = body;
  } else {
    const htmlBody = currentHtmlBody();
    if (!htmlBody.trim()) {
      notify('正文为空，不能转换。', 'error', 'editor-convert');
      return;
    }
    const converted = convertHtmlToMarkdown(htmlBody);
    if (!converted.markdown.trim()) {
      notify('转换后正文为空，已取消；可以先在正文里补一点内容。', 'error', 'editor-convert');
      return;
    }
    convertTarget.value = 'markdown';
    convertBody.value = converted.markdown;
    convertStats.value = converted.stats;
    convertLosses.value = converted.losses;
  }
  convertOpen.value = true;
}

async function confirmConvert(): Promise<void> {
  if (!session || converting.value) return;
  converting.value = true;
  convertError.value = '';
  try {
    await flush();
    const result = await window.xiao.content.convert(
      activeSiteDir,
      activeSlug,
      convertTarget.value,
      convertBody.value,
    );
    if (!result.ok) {
      convertError.value = `${result.message}。确认正文和站点权限后再试。`;
      notify(`转换失败：${result.message}`, 'error', 'editor-convert');
      return;
    }
    convertOpen.value = false;
    const label = result.data.format === 'html' ? 'HTML' : 'Markdown';
    notify(`已转换为 ${label} 文章，旧文件备份在 ${result.data.backup}`, 'info', 'editor-convert');
    sessionStore.activePostFormat = result.data.format;
    if (result.data.format === 'html') {
      sessionStore.setPage(htmlPostFileOf(activeSlug));
      return;
    }
    await open();
  } catch (error) {
    convertError.value = `转换时出错：${describeError(error)}。`;
    notify(convertError.value, 'error', 'editor-convert');
  } finally {
    converting.value = false;
  }
}

function onConvertMenuClick(close: () => void): void {
  close();
  requestConversion();
}

/** Posts 的右键菜单只负责发请求；真正转换由当前编辑器按同一篇文章完成。 */
function onConvertPostRequest(event: Event): void {
  const detail = (event as CustomEvent<{ slug?: string }>).detail;
  const slug = typeof detail?.slug === 'string' ? detail.slug : '';
  if (!slug) return;
  pendingConvertSlug = slug;
  if (slug === activeSlug && viewState.value === 'ready' && session) {
    pendingConvertSlug = '';
    void openConvertDialog();
  }
}

/* ---------- 浮层越界修正 ---------- */

const menuSelector =
  '.milkdown-slash-menu, .milkdown-toolbar, .milkdown-link-preview, .milkdown-link-edit';
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
  window.addEventListener('xiao:convert-post', onConvertPostRequest);
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
  window.removeEventListener('xiao:convert-post', onConvertPostRequest);
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
  [title, category, summary, tagsText, cover, date, draft, standalone],
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
    <WorkbenchBar
      v-model:mode="workbenchMode"
      :badge="formatLabel"
      :badge-tone="format === 'html' ? 'accent' : 'neutral'"
      :save-disabled="(viewState === 'loading' || viewState === 'error') && !showMonaco"
      @save="saveNow"
    >
      <UiTooltip label="在预览窗口打开这篇文章">
        <UiButton
          variant="primary"
          :icon="icons.preview"
          aria-label="在预览窗口打开这篇文章"
          @click="openPreview"
        >
          <span class="bar-label">预览</span>
        </UiButton>
      </UiTooltip>

      <UiTooltip label="用画布编辑这篇文章的版式">
        <UiButton
          :icon="icons.pages"
          :loading="layoutBusy"
          :disabled="layoutBusy || viewState !== 'ready'"
          aria-label="版式"
          @click="openPostLayout"
        >
          <span class="bar-label">版式</span>
        </UiButton>
      </UiTooltip>

      <UiPopover placement="bottom-end">
        <template #trigger>
          <UiButton :icon="icons.more" aria-label="更多操作" />
        </template>
        <template #default="{ close }">
          <div class="more-menu" role="menu">
            <button
              type="button"
              class="more-item"
              role="menuitem"
              :disabled="viewState !== 'ready' || converting"
              @click="onConvertMenuClick(close)"
            >
              <UiIcon :path="icons.code" :size="16" />
              <span>转换格式（{{ format === 'markdown' ? 'MD → HTML' : 'HTML → MD' }}）</span>
            </button>
          </div>
        </template>
      </UiPopover>
    </WorkbenchBar>

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
            <UiButton variant="primary" :icon-left="icons.edit" @click="beginWriting"
              >开始写第一段</UiButton
            >
          </template>
        </UiEmpty>
      </div>

      <div
        v-show="format === 'markdown' && viewState === 'ready' && !sourceMode"
        ref="crepeRoot"
        class="crepe"
      />
      <HtmlArticleEditor
        v-if="showHtmlVisual"
        :key="htmlKey"
        ref="htmlEditor"
        :site-dir="siteDir"
        :slug="slug"
        :html="htmlSeed"
        @change="onHtmlChange"
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

          <UiField
            label="摘要"
            :hint="hintFor('summary', '一两句话概括这篇，用于列表和搜索结果。')"
          >
            <UiTextarea
              v-model="summary"
              :rows="3"
              :disabled="!fieldsEditable"
              placeholder="这篇讲了什么？"
            />
          </UiField>

          <UiField label="封面" :hint="hintFor('cover', '图片地址；留空表示不用封面。')">
            <UiInput
              v-model="cover"
              :disabled="!fieldsEditable"
              placeholder="./cover.jpg 或站内路径"
            />
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

          <UiField
            v-if="format === 'html'"
            label="独立成页"
            hint="打开后不套文章模板，也没有站点顶栏和页脚；正文是完整 HTML 文档时原样输出。"
          >
            <UiSwitch
              v-model="standalone"
              :disabled="!fieldsEditable"
              aria-label="独立成页"
            />
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
            编辑模式改可见内容，源码模式改原始 HTML。浏览器可能会整理标签，精确结构请用源码。元数据只改
            frontmatter。
          </p>
          <p
            v-if="viewState !== 'loading' && viewState !== 'error' && !hasFrontmatter"
            class="inspector-note"
          >
            这篇没有 frontmatter，属性改动暂时不会写回文件；请先切到源码模式补上 frontmatter。
          </p>
        </div>
      </section>
    </Teleport>

    <UiDialog v-model="layoutConfirmOpen" title="生成自定义版式？" :width="520">
      <div class="convert-body">
        <p>
          这篇文章还没有自定义版式。会把站点的
          <code>src/layouts/PostLayout.astro</code> 复制成 <code>{{ layoutPath }}</code
          >，然后打开画布编辑。
        </p>
        <p>
          生成后只有这篇文章使用它，默认版式和其他文章不受影响。正文
          <code>&lt;slot /&gt;</code> 会作为受保护的「正文」块保留，可移动、可套容器，但不能删除。
        </p>
      </div>
      <template #actions>
        <UiButton variant="ghost" :disabled="layoutBusy" @click="layoutConfirmOpen = false">
          取消
        </UiButton>
        <UiButton variant="primary" :loading="layoutBusy" @click="confirmPostLayout">
          生成并打开版式
        </UiButton>
      </template>
    </UiDialog>

    <UiDialog
      v-model="convertOpen"
      :title="convertTarget === 'html' ? '转为 HTML 文章' : '转为 Markdown 文章'"
      :width="540"
    >
      <div class="convert-body">
        <p v-if="convertTarget === 'html'">
          高保真转换：把当前编辑器里的正文按渲染结构洗净后写成 HTML，元数据保持不变。
        </p>
        <p v-else>
          HTML → Markdown 是<strong>尽力而为的有损转换</strong>：Markdown 表达不了的结构会保留为内嵌
          HTML，无法安全保留的内容会丢弃，清单见下。
        </p>

        <div v-if="convertStats" class="convert-stats">
          <UiBadge tone="ok">保真 {{ convertStats.kept }}</UiBadge>
          <UiBadge tone="warn">保留 HTML {{ convertStats.html }}</UiBadge>
          <UiBadge tone="danger">丢弃 {{ convertStats.dropped }}</UiBadge>
        </div>

        <ul v-if="convertLosses.length" class="convert-losses">
          <li v-for="(item, index) in convertLosses" :key="index">{{ item }}</li>
        </ul>
        <p v-else-if="convertStats" class="convert-empty-loss">
          没有发现需要保留为 HTML 或丢弃的内容。
        </p>

        <p class="convert-backup">
          转换前会把原文件备份到站点的
          <code>.xiao/backups/</code>，然后只保留目标格式文件。转换是单次操作，不会自动双向同步。
        </p>
        <p v-if="convertError" class="convert-error" role="alert">{{ convertError }}</p>
      </div>

      <template #actions>
        <UiButton variant="ghost" :disabled="converting" @click="convertOpen = false"
          >取消</UiButton
        >
        <UiButton variant="primary" :loading="converting" @click="confirmConvert">
          {{ convertTarget === 'html' ? '确认转为 HTML' : '确认转为 Markdown' }}
        </UiButton>
      </template>
    </UiDialog>
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

.bar-label {
  display: inline;
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

.inspector-section-label {
  padding-top: var(--ui-s3);
  border-top: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  letter-spacing: 0.04em;
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

/* ---------- 更多菜单 / 格式转换对话框 ---------- */

.more-menu {
  display: flex;
  flex-direction: column;
  min-width: 220px;
  padding: var(--ui-s1);
}

.more-item {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
  padding: var(--ui-s2);
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}

.more-item:hover:not(:disabled) {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.more-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.convert-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.convert-body p {
  margin: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.convert-body strong {
  color: var(--ui-text);
}

.convert-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s2);
}

.convert-losses {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  max-height: 180px;
  margin: 0;
  padding: var(--ui-s2) var(--ui-s2) var(--ui-s2) var(--ui-s5);
  overflow: auto;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.convert-empty-loss {
  color: var(--ui-text-3);
}

.convert-backup {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.convert-backup code {
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
}

.convert-error {
  padding: var(--ui-s2);
  border: 1px solid var(--ui-danger-weak);
  border-radius: var(--ui-r-sm);
  color: var(--ui-danger) !important;
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
