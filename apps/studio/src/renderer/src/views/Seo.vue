<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { useSession } from '../stores/session.ts';
import { UiButton, UiDialog, UiEmpty, UiIcon, UiSpinner } from '../ui/index.ts';

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

interface IssueRow {
  issue: Issue;
  name: string;
  value: string;
}

interface RuleGroup {
  key: string;
  level: string;
  rule: string;
  hint: string;
  scope: string;
  rows: IssueRow[];
}

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
  'site-url-placeholder': '这个地址不能拿去发布，改成部署后的真实地址。',
  'slug-invalid': '地址标识只能用小写字母、数字和连字符。',
  'slug-duplicate': '两个目录用了同一个地址标识，改掉其中一个。',
  'title-too-long': '搜索结果大约显示 30 个汉字。把标题缩短后再体检。',
  'description-missing': '摘要会出现在搜索结果和分享卡片里。',
  'description-too-short': '摘要会显示在搜索结果里，太短时搜索引擎会自己截正文；建议 30–80 个汉字。',
  'description-too-long': '摘要大约要 30 到 80 个汉字，太长会被截断。',
  'og-image-missing': '没有分享图时，转发到社交平台只有文字卡片。',
  'og-image-missing-file': '分享图地址指向的文件不在构建产物里，换一张存在的图。',
  'img-alt-missing': '给图片补上 alt，读屏和搜索才能知道图里是什么。',
  'dead-link': '这个站内链接没有对应页面。',
  noindex: '这篇文章标记了不收录，搜索引擎不会索引它。',
};

const session = useSession();
const loading = ref(false);
const auditing = ref(false);
const errorText = ref('');
const report = ref<SeoReport | null>(null);
const checkIssues = ref<Issue[]>([]);
const posts = ref<PostItem[]>([]);
const drafts = ref<Record<string, string>>({});
const openKey = ref('');
const infoOpen = ref(false);
const previewOpen = ref(false);
const previewRoute = ref('/');

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

function pageOf(route: string): ReportPage | undefined {
  return report.value?.pages.find((page) => page.route === route);
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

function issueSlug(issue: Issue): string {
  return issue.fix?.slug || postSlug(issue.route);
}

function rowRank(issue: Issue): number {
  if (issue.fix?.kind === 'settings') return 0;
  if (issue.route === '/') return 1;
  return 2;
}

function rowName(issue: Issue): string {
  if (issue.fix?.kind === 'settings' && issue.fix.field === 'description') return '站点简介（首页）';
  if (issue.route === '/' && issue.fix?.kind !== 'post') return '首页';
  const slug = issueSlug(issue);
  if (slug) return postTitle(`/posts/${slug}`, slug);
  return issue.route || '站点';
}

function rowValue(issue: Issue): string {
  return issue.detail.match(/宽度 (\d+)/)?.[1] || issue.detail.match(/（(\d+)）/)?.[1] || '';
}

function scopeText(issues: Issue[]): string {
  if (issues.length === 1) {
    const issue = issues[0];
    if (!issue) return '站点';
    if (issue.rule.startsWith('site-url')) return '站点';
    const many = issue.detail.match(/首页和 (\d+) 篇文章/);
    if (many) return `首页 + ${many[1]} 篇文章`;
    if (issue.detail.includes('首页在用')) return '首页';
    const slug = issueSlug(issue);
    if (slug) return postTitle(`/posts/${slug}`, slug);
    if (issue.route === '/') return '首页';
    return '站点';
  }
  const home = issues.some(
    (issue) => issue.route === '/' || (issue.fix?.kind === 'settings' && issue.fix.field === 'description'),
  );
  const slugs = new Set(issues.map((issue) => issueSlug(issue)).filter(Boolean));
  if (home && slugs.size > 0) return `首页 + ${slugs.size} 篇文章`;
  if (home) return '首页';
  if (slugs.size > 0) return `${slugs.size} 篇文章`;
  return `${issues.length} 处`;
}

const ruleGroups = computed((): RuleGroup[] => {
  const map = new Map<string, Issue[]>();
  for (const issue of actionable.value) {
    const key = issue.rule;
    map.set(key, [...(map.get(key) ?? []), issue]);
  }
  return [...map.entries()].map(([rule, issues]) => ({
    key: rule,
    level: issues[0]?.level === 'error' ? 'error' : 'warn',
    rule,
    hint: hintOf(rule),
    scope: scopeText(issues),
    rows: issues
      .map((issue) => ({ issue, name: rowName(issue), value: rowValue(issue) }))
      .sort((a, b) => rowRank(a.issue) - rowRank(b.issue)),
  }));
});

const sections = computed(() =>
  (['error', 'warn'] as const)
    .map((level) => ({
      level,
      label: level === 'error' ? '错误' : '警告',
      groups: ruleGroups.value.filter((group) => group.level === level),
    }))
    .filter((section) => section.groups.length > 0),
);

const summaryLine = computed(() => {
  if (auditing.value) return '正在构建并体检。预览如果开着，结束后会重新打开。';
  if (!report.value) return '还没有体检。点「体检」后，这里只列出首页和文章的问题。';
  const date = new Date(report.value.generatedAt);
  const time = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (counts.value.errors === 0 && counts.value.warns === 0) {
    const articles = report.value.pages.filter((page) => page.route.startsWith('/posts/')).length;
    return `首页和 ${articles} 篇文章都没有问题${time ? ` · ${time} 体检` : ''}`;
  }
  return `${counts.value.errors} 个错误 · ${counts.value.warns} 个警告${time ? ` · ${time} 体检` : ''}`;
});

const previewPage = computed(() => pageOf(previewRoute.value));
const previewTitle = computed(() => {
  const page = previewPage.value;
  if (!page) return '预览';
  return page.route === '/' ? '首页预览' : postTitle(page.route, page.title || page.route);
});
const previewImage = computed(() => {
  const ogImage = previewPage.value?.ogImage ?? '';
  if (!ogImage || !session.previewUrl) return ogImage;
  try {
    const image = new URL(ogImage);
    const preview = new URL(session.previewUrl);
    return `${preview.origin}${image.pathname}`;
  } catch {
    return ogImage;
  }
});

function toggleGroup(key: string): void {
  openKey.value = openKey.value === key ? '' : key;
}

function openPreview(route: string): void {
  previewRoute.value = route || '/';
  previewOpen.value = true;
}

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
  previewOpen.value = false;
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
  const slug = issueSlug(issue);
  if (slug) {
    openPost(slug, postTitle(issue.route, slug));
    return;
  }
  if (issue.rule.startsWith('site-url') || issue.rule === 'og-image-missing' || issue.rule === 'html-lang-missing') {
    openSettings(issue.rule.startsWith('site-url') ? 'url' : 'ogImage');
    return;
  }
  notify('这条要到对应页面里改。', 'info', 'seo-fix');
}

function settingsAction(issue: Issue): boolean {
  return issue.fix?.kind === 'settings' || issue.rule.startsWith('site-url');
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
        <div class="title-row">
          <h1>SEO 体检</h1>
          <div class="head-actions">
            <UiButton v-if="report" size="sm" variant="ghost" @click="openPreview('/')">预览首页</UiButton>
            <UiButton size="sm" :icon-left="icons.refresh" :loading="auditing" @click="runAudit">
              {{ auditing ? '正在构建并体检…' : '体检' }}
            </UiButton>
          </div>
        </div>
        <p class="dim">{{ summaryLine }}</p>
      </header>

      <p v-if="errorText" class="error-text">{{ errorText }}</p>

      <UiEmpty
        v-if="!report && !checkIssues.length"
        title="还没有体检报告"
        description="点右上角「体检」。它会构建站点，再按首页和文章列出问题。"
        :icon="icons.seo"
      />

      <div v-else class="bands">
        <section v-for="section in sections" :key="section.level" class="band">
          <h2>{{ section.label }}</h2>
          <article v-for="group in section.groups" :key="group.key" class="rule">
            <div class="rule-head">
              <div class="rule-copy">
                <div class="rule-line">
                  <strong>{{ labelOf(group.rule) }}</strong>
                  <span class="scope">{{ group.scope }}</span>
                </div>
                <p>{{ group.hint }}</p>
              </div>
              <div class="rule-actions">
                <template v-if="group.rows.length === 1 && group.rows[0]">
                  <label v-if="editable(group.rows[0].issue)" class="edit">
                    <input
                      v-model="drafts[draftKey(group.rows[0].issue)]"
                      :placeholder="group.rows[0].issue.fix?.field === 'title' ? '新的标题' : '新的摘要'"
                      @focus="loadDraft(group.rows[0].issue)"
                    />
                    <UiButton size="sm" @click="saveDraft(group.rows[0].issue)">保存</UiButton>
                  </label>
                  <UiButton
                    v-if="group.rows[0].issue.route.startsWith('/posts/')"
                    size="sm"
                    variant="ghost"
                    @click="openPreview(group.rows[0].issue.route)"
                  >
                    预览
                  </UiButton>
                  <UiButton size="sm" variant="ghost" @click="fixIssue(group.rows[0].issue)">
                    {{ settingsAction(group.rows[0].issue) ? '去设置' : '打开文章' }}
                  </UiButton>
                </template>
                <UiButton
                  v-else
                  size="sm"
                  variant="ghost"
                  :icon-left="openKey === group.key ? icons.chevronDown : icons.chevronRight"
                  @click="toggleGroup(group.key)"
                >
                  {{ openKey === group.key ? '收起' : '展开' }}
                </UiButton>
              </div>
            </div>
            <div v-if="group.rows.length > 1 && openKey === group.key" class="rows">
              <div v-for="(row, index) in group.rows" :key="`${group.key}-${row.issue.route}-${index}`" class="row">
                <span class="row-name">{{ row.name }}</span>
                <span class="row-value">{{ row.value }}</span>
                <div class="row-actions">
                  <label v-if="editable(row.issue)" class="edit">
                    <input
                      v-model="drafts[draftKey(row.issue)]"
                      :placeholder="row.issue.fix?.field === 'title' ? '新的标题' : '新的摘要'"
                      @focus="loadDraft(row.issue)"
                    />
                    <UiButton size="sm" @click="saveDraft(row.issue)">保存</UiButton>
                  </label>
                  <UiButton v-if="row.issue.route.startsWith('/posts/')" size="sm" variant="ghost" @click="openPreview(row.issue.route)">
                    预览
                  </UiButton>
                  <UiButton size="sm" variant="ghost" @click="fixIssue(row.issue)">
                    {{ settingsAction(row.issue) ? '去设置' : '打开文章' }}
                  </UiButton>
                </div>
              </div>
            </div>
          </article>
        </section>

        <details v-if="infoIssues.length" class="info-fold" :open="infoOpen" @toggle="infoOpen = ($event.target as HTMLDetailsElement).open">
          <summary>另有 {{ infoIssues.length }} 条提示</summary>
          <div v-for="issue in infoIssues" :key="`${issue.route}-${issue.rule}-${issue.detail}`" class="info-row">
            <strong>{{ labelOf(issue.rule) }}</strong>
            <span>{{ issue.detail }}</span>
            <span class="scope">{{ rowName(issue) }}</span>
          </div>
        </details>
      </div>

      <UiDialog v-model="previewOpen" :title="previewTitle" :width="560">
        <div v-if="previewPage" class="dialog-preview">
          <section>
            <h3>搜索结果</h3>
            <article class="serp">
              <p class="serp-url">{{ previewPage.canonical || previewPage.route }}</p>
              <p class="serp-title">{{ previewPage.title || '（没有标题）' }}</p>
              <p class="serp-desc">{{ previewPage.description || '（没有摘要）' }}</p>
            </article>
          </section>
          <section>
            <h3>分享卡片</h3>
            <article class="social">
              <img v-if="previewImage" class="social-photo" :src="previewImage" alt="" />
              <div v-else class="social-image">
                <UiIcon :path="icons.image" :size="18" />
                <span>这页没有 og:image</span>
              </div>
              <div class="social-body">
                <p class="social-title">{{ previewPage.title || '（没有标题）' }}</p>
                <p class="social-desc">{{ previewPage.description || '（没有摘要）' }}</p>
              </div>
            </article>
          </section>
        </div>
        <p v-else class="dim">这份报告里没有这一页的标题和摘要。</p>
      </UiDialog>
    </template>
  </section>
</template>

<style scoped>
.seo {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
  max-width: 880px;
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
  flex-direction: column;
  gap: var(--ui-s1);
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s3);
}

.title-row h1 {
  margin: 0;
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
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

.bands {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s5);
}

.band {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}

.band h2 {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 500;
}

.rule {
  padding-bottom: var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.rule-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-s3);
}

.rule-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rule-line {
  display: flex;
  align-items: baseline;
  gap: var(--ui-s3);
}

.rule-line strong {
  font-size: var(--ui-fs-3);
}

.rule-copy p,
.info-row span {
  margin: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.scope {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  white-space: nowrap;
}

.rule-actions,
.row-actions,
.edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-s2);
}

.rows {
  display: flex;
  flex-direction: column;
  max-height: 16rem;
  margin-top: var(--ui-s2);
  overflow: auto;
}

.row {
  display: grid;
  grid-template-columns: minmax(8rem, 14rem) 3rem minmax(0, 1fr);
  gap: var(--ui-s2);
  align-items: center;
  min-height: 2.5rem;
  padding: 4px 0 4px var(--ui-s3);
  border-top: 1px solid var(--ui-line);
}

.row-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-value {
  color: var(--ui-text-3);
  font-variant-numeric: tabular-nums;
}

.edit input {
  width: 180px;
  padding: 6px 8px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text);
  font: inherit;
  font-size: var(--ui-fs-2);
}

.info-fold {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.info-fold summary {
  cursor: pointer;
}

.info-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-s2);
  align-items: baseline;
  padding-top: var(--ui-s2);
}

.dialog-preview {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
}

.dialog-preview h3 {
  margin: 0 0 var(--ui-s2);
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
</style>
