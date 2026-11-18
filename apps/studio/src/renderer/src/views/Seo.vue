<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import {
  UiBadge,
  UiButton,
  UiEmpty,
  UiField,
  UiIcon,
  UiPanel,
  UiSelect,
  UiSpinner,
} from '../ui/index.ts';

interface FixTarget {
  kind: 'post' | 'settings';
  slug?: string;
  field?: string;
}

interface Issue {
  level: string;
  rule: string;
  detail: string;
  route: string;
  fix?: FixTarget;
}

interface ReportPage {
  route: string;
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
}

interface SeoReport {
  generatedAt: string;
  siteUrl: string;
  pageCount: number;
  issues: Issue[];
  pages: ReportPage[];
}

interface PostItem {
  slug: string;
  title: string;
  category: string;
  draft: boolean;
  format?: 'markdown' | 'html';
}

type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

const RULE_LABELS: Record<string, string> = {
  'site-url-missing': '站点地址还没填',
  'site-url-placeholder': '站点地址还是占位',
  'slug-invalid': '地址标识不合法',
  'slug-duplicate': '地址标识重复',
  'title-missing': '缺少标题',
  'title-too-long': '标题太长',
  'title-duplicate': '标题重复',
  'description-missing': '缺少摘要',
  'description-too-short': '摘要太短',
  'description-too-long': '摘要太长',
  'description-duplicate': '摘要重复',
  'canonical-missing': '缺少 canonical',
  'canonical-invalid': 'canonical 不是本站绝对地址',
  'og-title-missing': '缺少 og:title',
  'og-description-missing': '缺少 og:description',
  'og-image-missing': '缺少分享图',
  'og-image-missing-file': '分享图文件不存在',
  'h1-count': 'h1 数量不对',
  'img-alt-missing': '图片缺少 alt',
  'image-too-large': '图片超过 2 MB',
  'dead-link': '站内死链',
  noindex: '不收录',
  'html-lang-missing': '缺少语言标记',
  'post-tags-missing': '文章没有标签',
  'post-category-missing': '文章没有分类',
};

const RULE_HINTS: Record<string, string> = {
  'site-url-missing': '到「设置」填写部署后的完整地址，例如 https://name.github.io。',
  'site-url-placeholder': 'example.com 不能拿去发布。到「设置」改成真实站点地址。',
  'slug-invalid': '地址标识只能用小写字母、数字和连字符。',
  'slug-duplicate': '两个目录用了同一个地址标识，改掉其中一个。',
  'title-too-long': '搜索结果大约显示 30 个汉字。把标题缩短后再体检。',
  'description-missing': '摘要会出现在搜索结果和分享卡片里。',
  'description-too-short': '摘要大约要 30 到 80 个汉字，太短会被搜索引擎自己截正文。',
  'description-too-long': '摘要大约要 30 到 80 个汉字，太长会被截断。',
  'og-image-missing': '文章可以写封面，站点也可以在「设置」里填默认分享图。',
  'img-alt-missing': '给图片补上 alt，读屏和搜索才能知道图里是什么。',
  'dead-link': '这个站内链接没有对应页面。',
};

const session = useSession();
const loading = ref(false);
const auditing = ref(false);
const errorText = ref('');
const report = ref<SeoReport | null>(null);
const checkIssues = ref<Issue[]>([]);
const posts = ref<PostItem[]>([]);
const selectedRoute = ref('');
const infoOpen = ref(false);

const levels: Record<string, { label: string; tone: BadgeTone }> = {
  error: { label: '错误', tone: 'danger' },
  warn: { label: '警告', tone: 'warn' },
  info: { label: '提示', tone: 'neutral' },
};

function asReport(value: unknown): SeoReport | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw['issues']) || !Array.isArray(raw['pages'])) return null;
  return raw as unknown as SeoReport;
}

function labelOf(rule: string): string {
  return RULE_LABELS[rule] ?? rule;
}

function hintOf(rule: string): string {
  return RULE_HINTS[rule] ?? '按说明改完后，再点一次「体检」。';
}

function postSlug(route: string): string {
  const match = /\/posts\/([^/]+)/.exec(route);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function postTitle(route: string, fallback: string): string {
  const slug = postSlug(route);
  return posts.value.find((post) => post.slug === slug)?.title || fallback || route;
}

/** 已有构建报告时，构建前检查只留下 slug 问题，避免和报告里的首页、文章重复开一组。 */
const listedChecks = computed(() =>
  report.value ? checkIssues.value.filter((issue) => issue.rule.startsWith('slug')) : checkIssues.value,
);
const actionable = computed(() =>
  [...(report.value?.issues ?? []), ...listedChecks.value].filter((issue) => issue.level !== 'info'),
);
const infoIssues = computed(() =>
  [...(report.value?.issues ?? []), ...listedChecks.value].filter((issue) => issue.level === 'info'),
);

const counts = computed(() => ({
  errors: actionable.value.filter((issue) => issue.level === 'error').length,
  warns: actionable.value.filter((issue) => issue.level === 'warn').length,
}));

const groups = computed(() => {
  const map = new Map<string, Issue[]>();
  for (const issue of actionable.value) {
    const key = issue.route || '构建前';
    map.set(key, [...(map.get(key) ?? []), issue]);
  }
  return [...map.entries()].map(([route, issues]) => {
    const page = report.value?.pages.find((item) => item.route === route);
    return {
      route,
      title: route === '构建前' ? '构建前检查' : postTitle(route, page?.title || route),
      issues,
    };
  });
});

const pageOptions = computed(() =>
  (report.value?.pages ?? []).map((page) => ({
    value: page.route,
    label: postTitle(page.route, page.title || page.route),
  })),
);

const selectedPage = computed(
  () =>
    report.value?.pages.find((page) => page.route === selectedRoute.value) ??
    report.value?.pages[0],
);

const generatedLabel = computed(() => {
  const raw = report.value?.generatedAt;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('zh-CN', { hour12: false });
});

const cardImage = computed(() => {
  const ogImage = selectedPage.value?.ogImage ?? '';
  if (!ogImage || !session.previewUrl) return ogImage;
  try {
    const image = new URL(ogImage);
    const preview = new URL(session.previewUrl);
    return `${preview.origin}${image.pathname}`;
  } catch {
    return ogImage;
  }
});

function levelLabel(level: string): string {
  return levels[level]?.label ?? '提示';
}

function levelTone(level: string): BadgeTone {
  return levels[level]?.tone ?? 'neutral';
}

const drafts = ref<Record<string, string>>({});

function draftKey(issue: Issue): string {
  return `${issue.fix?.slug ?? ''}:${issue.fix?.field ?? ''}`;
}

function editable(issue: Issue): boolean {
  return (
    issue.fix?.kind === 'post' &&
    (issue.fix.field === 'title' || issue.fix.field === 'description') &&
    Boolean(issue.fix.slug)
  );
}

function fieldValue(source: string, key: string): string {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(source);
  const raw = match?.[1]?.trim() ?? '';
  if (raw.length >= 2 && ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"')))) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

function setField(source: string, key: string, value: string): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return source;
  const line = `${key}: '${value.replace(/'/g, "''")}'`;
  const body = source.slice(match[0].length);
  const current = match[1] ?? '';
  const next = new RegExp(`^${key}:.*$`, 'm').test(current)
    ? current.replace(new RegExp(`^${key}:.*$`, 'm'), line)
    : `${current}${newline}${line}`;
  return `---${newline}${next}${newline}---${newline}${body}`;
}

async function loadDraft(issue: Issue): Promise<void> {
  const slug = issue.fix?.slug;
  const field = issue.fix?.field;
  const siteDir = session.siteDir;
  if (!siteDir || !slug || (field !== 'title' && field !== 'description')) return;
  const key = draftKey(issue);
  if (drafts.value[key] !== undefined) return;
  const read = await window.xiao.content.read(siteDir, slug);
  if (drafts.value[key] !== undefined) return;
  drafts.value[key] = read.ok ? fieldValue(read.data, field) : '';
}

async function saveDraft(issue: Issue): Promise<void> {
  const slug = issue.fix?.slug;
  const field = issue.fix?.field;
  const siteDir = session.siteDir;
  if (!siteDir || !slug || (field !== 'title' && field !== 'description')) return;
  const read = await window.xiao.content.read(siteDir, slug);
  if (!read.ok) {
    notify(`读不到文章：${read.message}`, 'error', 'seo-save');
    return;
  }
  const next = setField(read.data, field, drafts.value[draftKey(issue)] ?? '');
  const write = await window.xiao.content.write(siteDir, slug, next);
  if (!write.ok) {
    notify(`没有保存：${write.message}`, 'error', 'seo-save');
    return;
  }
  notify('已写入文章。请再点一次「体检」。', 'info', 'seo-save');
}

function openPost(slug: string, title: string): void {
  if (!slug) return;
  const post = posts.value.find((item) => item.slug === slug);
  session.activePost = slug;
  session.activePostFormat = post?.format ?? 'markdown';
  window.dispatchEvent(new CustomEvent('xiao:open-post', { detail: { slug } }));
  notify(`已打开「${title}」。`, 'info', 'seo-fix');
}

function settingsFieldLabel(field?: string): string {
  if (field === 'ogImage') return '默认分享图';
  if (field === 'description') return '站点简介';
  return '站点地址';
}

function openSettings(field?: string): void {
  session.setNav('settings');
  if (field === 'twitter') {
    notify('已切到「设置」。Twitter 账号还没有单独的输入框。', 'info', 'seo-fix');
    return;
  }
  window.dispatchEvent(new CustomEvent('xiao:focus-setting', { detail: { field } }));
  notify(`已切到「设置」的${settingsFieldLabel(field)}。`, 'info', 'seo-fix');
}

function fixIssue(issue: Issue): void {
  if (issue.fix?.kind === 'settings') {
    openSettings(issue.fix.field);
    return;
  }
  const slug = issue.fix?.slug || postSlug(issue.route);
  if (slug) {
    openPost(slug, postTitle(issue.route, slug));
    return;
  }
  if (
    issue.rule.startsWith('site-url') ||
    issue.rule === 'og-image-missing' ||
    issue.rule === 'html-lang-missing'
  ) {
    openSettings(issue.rule.startsWith('site-url') ? 'url' : 'ogImage');
    return;
  }
  notify('这条要到对应页面里改。', 'info', 'seo-fix');
}

async function loadCheck(siteDir: string): Promise<void> {
  const check = await window.xiao.seo.check(siteDir);
  if (!check.ok) {
    checkIssues.value = [];
    return;
  }
  checkIssues.value = check.data.map((row) => ({
    level: row.level,
    rule: row.rule,
    detail: row.detail,
    route: row.rule.startsWith('slug') ? `/posts/${row.detail}` : '构建前',
    fix:
      row.rule.startsWith('site-url')
        ? { kind: 'settings', field: 'url' }
        : row.rule === 'og-image-missing'
          ? { kind: 'settings', field: 'ogImage' }
          : row.rule.startsWith('slug')
            ? { kind: 'post', slug: row.detail }
            : undefined,
  }));
}

async function load(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir) {
    report.value = null;
    checkIssues.value = [];
    posts.value = [];
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const [saved, listed] = await Promise.all([
      window.xiao.seo.report(siteDir),
      window.xiao.content.list(siteDir),
    ]);
    report.value = saved.ok ? asReport(saved.data) : null;
    posts.value = listed.ok ? listed.data : [];
    await loadCheck(siteDir);
    if (!report.value?.pages.some((page) => page.route === selectedRoute.value)) {
      selectedRoute.value =
        report.value?.pages.find((page) => page.route === '/')?.route ??
        report.value?.pages[0]?.route ??
        '';
    }
  } finally {
    loading.value = false;
  }
}

async function runAudit(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir || auditing.value) return;
  auditing.value = true;
  errorText.value = '';
  try {
    const result = await window.xiao.seo.audit(siteDir);
    if (!result.ok) {
      report.value = null;
      errorText.value = `构建未通过。\n${result.message}`;
      notify('构建未通过。', 'error', 'seo-audit');
      return;
    }
    report.value = result.data.report;
    if (result.data.report) {
      selectedRoute.value =
        result.data.report.pages.find((page) => page.route === '/')?.route ??
        result.data.report.pages[0]?.route ??
        '';
    }
    await loadCheck(siteDir);
    if (result.data.buildFailed) {
      errorText.value = `构建未通过。\n${result.data.message || '构建没有完成'}`;
      notify('构建未通过。', 'error', 'seo-audit');
    } else {
      notify('体检完成。', 'info', 'seo-audit');
    }
    if (result.data.previewError) {
      const line = `预览没有恢复：${result.data.previewError}`;
      errorText.value = errorText.value ? `${errorText.value}\n${line}` : line;
      notify(line, 'error', 'seo-preview');
    }
  } finally {
    auditing.value = false;
  }
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
  <section class="seo">
    <div v-if="!session.siteDir" class="center">
      <UiEmpty
        title="还没打开站点"
        description="SEO 体检要读构建后的页面。先打开一个站点，再回到这里。"
        :icon="icons.seo"
      />
    </div>

    <div v-else-if="loading" class="center">
      <UiSpinner :size="20" />
      <p class="dim">正在读取上次的体检报告…</p>
    </div>

    <template v-else>
      <header class="head">
        <div class="head-text">
          <h1>SEO 体检</h1>
          <p class="dim">
            体检会构建站点，再读 dist 里的真实 HTML。预览如果开着，结束后会重新打开。
            <template v-if="generatedLabel">上次生成于 {{ generatedLabel }}。</template>
          </p>
        </div>
        <UiButton size="sm" :icon-left="icons.refresh" :loading="auditing" @click="runAudit">
          {{ auditing ? '正在构建并体检…' : '体检' }}
        </UiButton>
      </header>

      <p v-if="auditing" class="dim">构建进行中。完成后会更新下面的列表和预览。</p>
      <p v-if="errorText" class="error-text">{{ errorText }}</p>

      <div v-if="report" class="stats">
        <article class="stat is-danger">
          <span class="stat-num">{{ counts.errors }}</span>
          <span class="stat-label">错误</span>
          <span class="stat-hint">{{ report.pageCount }} 个页面</span>
        </article>
        <article class="stat is-warn">
          <span class="stat-num">{{ counts.warns }}</span>
          <span class="stat-label">警告</span>
          <span class="stat-hint">提示 {{ infoIssues.length }} 条，单独折叠</span>
        </article>
      </div>

      <div class="columns">
        <div class="main-col">
          <UiPanel title="问题">
            <UiEmpty
              v-if="!report && !checkIssues.length"
              title="还没有体检报告"
              description="点右上角「体检」。它会构建站点，再按 dist 里的 HTML 列出问题。"
              :icon="icons.seo"
            />
            <UiEmpty
              v-else-if="!groups.length"
              title="没有错误或警告"
              description="构建前检查和上次报告里，没有需要马上处理的问题。"
              :icon="icons.ok"
            />
            <div v-else class="groups">
              <section v-for="group in groups" :key="group.route" class="group">
                <header class="group-head">
                  <h2>{{ group.title }}</h2>
                  <span class="dim">{{ group.route }}</span>
                </header>
                <article v-for="issue in group.issues" :key="`${group.route}-${issue.rule}-${issue.detail}`" class="issue">
                  <UiBadge :tone="levelTone(issue.level)">{{ levelLabel(issue.level) }}</UiBadge>
                  <div class="issue-body">
                    <strong>{{ labelOf(issue.rule) }}</strong>
                    <p>{{ issue.detail }}</p>
                    <p class="dim">{{ hintOf(issue.rule) }}</p>
                  </div>
                  <div class="issue-actions">
                    <label v-if="editable(issue)" class="edit">
                      <input
                        v-model="drafts[draftKey(issue)]"
                        :placeholder="issue.fix?.field === 'title' ? '新的标题' : '新的摘要'"
                        @focus="loadDraft(issue)"
                      />
                      <UiButton size="sm" @click="saveDraft(issue)">保存</UiButton>
                    </label>
                    <UiButton size="sm" variant="ghost" @click="fixIssue(issue)">
                      {{ issue.fix?.kind === 'settings' || issue.rule.startsWith('site-url') ? '去设置' : '打开文章' }}
                    </UiButton>
                  </div>
                </article>
              </section>
            </div>
          </UiPanel>

          <details v-if="infoIssues.length" class="info-fold" :open="infoOpen" @toggle="infoOpen = ($event.target as HTMLDetailsElement).open">
            <summary>提示 {{ infoIssues.length }} 条</summary>
            <article v-for="issue in infoIssues" :key="`${issue.route}-${issue.rule}-${issue.detail}`" class="issue">
              <UiBadge tone="neutral">提示</UiBadge>
              <div class="issue-body">
                <strong>{{ labelOf(issue.rule) }}</strong>
                <p>{{ issue.detail }}</p>
                <p class="dim">{{ issue.route }}</p>
              </div>
            </article>
          </details>
        </div>

        <aside class="preview-col">
          <UiPanel title="预览">
            <UiEmpty
              v-if="!report"
              title="还没有可预览的页面"
              description="体检完成后，这里显示该页真实的标题、摘要和分享图。"
              :icon="icons.seo"
            />
            <template v-else>
              <div class="preview-picker">
                <UiField label="预览页面">
                  <UiSelect v-model="selectedRoute" :options="pageOptions" placeholder="选择页面" />
                </UiField>
              </div>
              <section class="preview-block">
                <h3 class="preview-title">搜索结果</h3>
                <article class="serp">
                  <p class="serp-url">{{ selectedPage?.canonical || selectedPage?.route }}</p>
                  <p class="serp-title">{{ selectedPage?.title || '（没有标题）' }}</p>
                  <p class="serp-desc">{{ selectedPage?.description || '（没有摘要）' }}</p>
                </article>
              </section>
              <section class="preview-block">
                <h3 class="preview-title">分享卡片</h3>
                <article class="social">
                  <img v-if="cardImage" class="social-photo" :src="cardImage" alt="" />
                  <div v-else class="social-image empty">
                    <UiIcon :path="icons.image" :size="18" />
                    <span>这页没有 og:image</span>
                  </div>
                  <div class="social-body">
                    <p class="social-title">{{ selectedPage?.title || '（没有标题）' }}</p>
                    <p class="social-desc">{{ selectedPage?.description || '（没有摘要）' }}</p>
                  </div>
                </article>
              </section>
            </template>
          </UiPanel>
        </aside>
      </div>
    </template>
  </section>
</template>

<style scoped>
.seo {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
}

.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s8) var(--ui-s4);
  text-align: center;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-s4);
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  min-width: 0;
}

.head-text h1 {
  margin: 0;
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

.dim {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.error-text {
  margin: 0;
  color: var(--ui-danger);
  font-size: var(--ui-fs-2);
  white-space: pre-wrap;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s3);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding: var(--ui-s3) var(--ui-s4);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
}

.stat-num {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.1;
}

.stat-label {
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.stat-hint {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.stat.is-danger .stat-num {
  color: var(--ui-danger);
}

.stat.is-warn .stat-num {
  color: var(--ui-warn);
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-s4);
  align-items: start;
}

.main-col,
.groups,
.group,
.issue-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  min-width: 0;
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-s3);
}

.group-head h2 {
  margin: 0;
  font-size: var(--ui-fs-3);
}

.issue-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--ui-s2);
}

.edit {
  display: flex;
  gap: var(--ui-s2);
  align-items: center;
}

.edit input {
  width: 220px;
  padding: 6px 8px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text);
  font: inherit;
  font-size: var(--ui-fs-2);
}

.issue {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--ui-s3);
  align-items: start;
  padding-top: var(--ui-s2);
  border-top: 1px solid var(--ui-line);
}

.issue-body p {
  margin: 0;
}

.info-fold {
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
}

.preview-col {
  min-width: 0;
  position: sticky;
  top: var(--ui-s4);
}

.preview-picker {
  margin-bottom: var(--ui-s3);
}

.preview-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  padding-top: var(--ui-s3);
  border-top: 1px solid var(--ui-line);
}

.preview-block + .preview-block {
  margin-top: var(--ui-s3);
}

.preview-title {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 600;
}

.serp,
.social {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
}

.serp {
  padding: var(--ui-s3);
}

.serp-url,
.social-desc,
.serp-desc {
  margin: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.serp-title,
.social-title {
  margin: 0;
  color: var(--ui-text);
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.serp-title {
  color: var(--ui-accent);
}

.social-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding: var(--ui-s3);
}

.social-photo {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: cover;
}

.social-image {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  height: 88px;
  padding: 0 var(--ui-s3);
  color: var(--ui-text-3);
}

@media (max-width: 1180px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }

  .preview-col {
    position: static;
  }
}
</style>
