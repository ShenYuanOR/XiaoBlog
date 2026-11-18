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
  description: string;
  cover: string;
  format: 'markdown' | 'html';
}

interface Tag {
  level: 'error' | 'warn';
  text: string;
}

/** 显示宽度：汉字和全角算 2，其余算 1。与 main/seo.ts、seo-audit.mjs 保持一致，改规则时三处一起改。 */
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width +=
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
        ? 2
        : 1;
  }
  return width;
}

/** 与 packages/template/src/lib/seo.ts 的 excerptFromBody 一致，只给没写摘要的文章估算自动摘要。 */
function excerptFromBody(body: string, limit = 80): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, limit).join('').trim();
}

function charsOf(text: string): number {
  return Math.round(displayWidth(text) / 2);
}

function placeholderUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'example.com' || host.endsWith('.example.com') || host === 'example.org' || host === 'localhost';
  } catch {
    return true;
  }
}

const REPORT_LABELS: Record<string, string> = {
  'canonical-missing': '缺少 canonical',
  'canonical-invalid': 'canonical 不对',
  'og-title-missing': '缺少 og:title',
  'og-description-missing': '缺少 og:description',
  'og-image-missing-file': '分享图文件不存在',
  'h1-count': 'h1 数量不对',
  'img-alt-missing': '图片缺少 alt',
  'image-too-large': '图片超过 2 MB',
  'html-lang-missing': '缺少语言标记',
  'dead-link': '站内死链',
};

const LIVE_RULES = new Set([
  'site-url-missing',
  'site-url-placeholder',
  'title-too-long',
  'title-duplicate',
  'description-missing',
  'description-too-short',
  'description-too-long',
  'description-duplicate',
  'og-image-missing',
]);

const session = useSession();
const loading = ref(false);
const auditing = ref(false);
const savingSite = ref(false);
const savingPost = ref(false);
const errorText = ref('');
const buildLog = ref('');
const report = ref<SeoReport | null>(null);
const posts = ref<PostItem[]>([]);
const excerpts = ref<Record<string, string>>({});
const rawConfig = ref<Record<string, unknown> | null>(null);
const siteTitle = ref('');
const titleTemplate = ref('%s');
const siteUrl = ref('');
const siteDescription = ref('');
const siteOgImage = ref('');
const filter = ref<'all' | 'problem' | 'ok'>('all');
const query = ref('');
const openSlug = ref('');
const editTitle = ref('');
const editDescription = ref('');
const previewOpen = ref(false);
const previewSlug = ref('');

function asReport(value: unknown): SeoReport | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw['issues']) || !Array.isArray(raw['pages'])) return null;
  return raw as unknown as SeoReport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clock(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const reportClock = computed(() => (report.value ? clock(report.value.generatedAt) : ''));

const urlStatus = computed(() => {
  const url = siteUrl.value.trim();
  if (!url) return { tone: 'error', text: '还没填' };
  if (placeholderUrl(url)) return { tone: 'error', text: '占位，不能发布' };
  return { tone: 'ok', text: '可以发布' };
});

const descriptionStatus = computed(() => {
  const text = siteDescription.value.trim();
  const count = charsOf(text);
  if (!text) return { tone: 'warn', text: '没写，建议 30–80 字' };
  if (displayWidth(text) < 60 || displayWidth(text) > 160) {
    return { tone: 'warn', text: `约 ${count} 字，建议 30–80 字` };
  }
  return { tone: 'ok', text: `约 ${count} 字` };
});

const postsWithoutCover = computed(() => posts.value.filter((post) => !post.cover.trim()).length);

const ogStatus = computed(() => {
  if (!siteOgImage.value.trim()) {
    return { tone: 'warn', text: `未设置，${postsWithoutCover.value} 篇文章分享时没有图` };
  }
  return { tone: 'ok', text: '已设置' };
});

function liveTitle(post: PostItem): string {
  return openSlug.value === post.slug ? editTitle.value : post.title;
}

function liveDescription(post: PostItem): string {
  return openSlug.value === post.slug ? editDescription.value : post.description;
}

function effectiveDescription(post: PostItem): string {
  return liveDescription(post).trim() || excerpts.value[post.slug] || '';
}

function reportIssuesFor(slug: string): Issue[] {
  return (report.value?.issues ?? []).filter((issue) => {
    if (LIVE_RULES.has(issue.rule)) return false;
    return issue.route === `/posts/${slug}`;
  });
}

function tagsFor(post: PostItem): Tag[] {
  const tags: Tag[] = [];
  const title = liveTitle(post).trim();
  const written = liveDescription(post).trim();
  if (displayWidth(title) > 60) {
    tags.push({ level: 'warn', text: `标题太长（约 ${charsOf(title)} 字）` });
  }
  if (!written) {
    tags.push({ level: 'warn', text: '没写摘要（自动截取正文）' });
  } else if (displayWidth(written) < 60) {
    tags.push({ level: 'warn', text: `摘要太短（约 ${charsOf(written)} 字）` });
  } else if (displayWidth(written) > 160) {
    tags.push({ level: 'warn', text: `摘要太长（约 ${charsOf(written)} 字）` });
  }
  const mine = effectiveDescription(post);
  if (mine) {
    const other = posts.value.find(
      (item) => item.slug !== post.slug && effectiveDescription(item) === mine,
    );
    if (other) tags.push({ level: 'warn', text: `摘要与《${liveTitle(other)}》重复` });
  }
  for (const issue of reportIssuesFor(post.slug)) {
    tags.push({
      level: issue.level === 'error' ? 'error' : 'warn',
      text: REPORT_LABELS[issue.rule] ?? issue.rule,
    });
  }
  return tags;
}

function rowLevel(post: PostItem): 'error' | 'warn' | 'ok' {
  const tags = tagsFor(post);
  if (tags.some((tag) => tag.level === 'error')) return 'error';
  if (tags.length > 0) return 'warn';
  return 'ok';
}

const problemCount = computed(() => posts.value.filter((post) => rowLevel(post) !== 'ok').length);
const okCount = computed(() => posts.value.length - problemCount.value);

const visiblePosts = computed(() => {
  const keyword = query.value.trim();
  return [...posts.value]
    .filter((post) => {
      if (keyword && !liveTitle(post).includes(keyword) && !post.title.includes(keyword)) return false;
      const level = rowLevel(post);
      if (filter.value === 'problem') return level !== 'ok';
      if (filter.value === 'ok') return level === 'ok';
      return true;
    })
    .sort((a, b) => {
      const order = { error: 0, warn: 1, ok: 2 };
      const diff = order[rowLevel(a)] - order[rowLevel(b)];
      return diff || a.title.localeCompare(b.title, 'zh-CN');
    });
});

const summaryLine = computed(() => {
  if (auditing.value) return '正在构建并体检。预览如果开着，结束后会重新打开。';
  if (!report.value) return `${problemCount.value} 篇有问题 · 点体检检查生成后的页面`;
  return `${problemCount.value} 篇有问题 · 上次体检 ${reportClock.value}`;
});

const editTitleCount = computed(() => charsOf(editTitle.value.trim()));
const editDescCount = computed(() => charsOf(editDescription.value.trim()));
const editTitleTone = computed(() => (displayWidth(editTitle.value.trim()) > 60 ? 'warn' : 'ok'));
const editDescTone = computed(() => {
  const text = editDescription.value.trim();
  if (!text) return 'warn';
  const width = displayWidth(text);
  return width < 60 || width > 160 ? 'warn' : 'ok';
});

function templatedTitle(title: string): string {
  const pageTitle = title.trim();
  if (!pageTitle || pageTitle === siteTitle.value) return siteTitle.value || pageTitle;
  return (titleTemplate.value || '%s').replace('%s', pageTitle);
}

const previewPost = computed(() => posts.value.find((post) => post.slug === previewSlug.value));
const previewTitle = computed(() => (previewPost.value ? templatedTitle(liveTitle(previewPost.value)) : ''));
const previewDescription = computed(() => (previewPost.value ? effectiveDescription(previewPost.value) : ''));
const previewImage = computed(() => {
  const source = previewPost.value?.cover.trim() || siteOgImage.value.trim();
  if (!source) return '';
  if (/^https?:\/\//i.test(source)) return source;
  if (!session.previewUrl) return source;
  try {
    const preview = new URL(session.previewUrl);
    return `${preview.origin}${source.startsWith('/') ? source : `/${source}`}`;
  } catch {
    return source;
  }
});

function serpUrl(slug: string): string {
  const root = siteUrl.value.trim().replace(/\/+$/, '');
  if (!root) return `/posts/${slug}/`;
  return `${root}/posts/${slug}/`;
}

function toggle(slug: string): void {
  if (openSlug.value === slug) {
    openSlug.value = '';
    return;
  }
  const post = posts.value.find((item) => item.slug === slug);
  if (!post) return;
  editTitle.value = post.title;
  editDescription.value = post.description;
  openSlug.value = slug;
}

function openCard(slug: string): void {
  previewSlug.value = slug;
  previewOpen.value = true;
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

function bodyOf(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

async function loadExcerpts(siteDir: string): Promise<void> {
  const missing = posts.value.filter((post) => !post.description.trim());
  const next: Record<string, string> = {};
  await Promise.all(
    missing.map(async (post) => {
      const read = await window.xiao.content.read(siteDir, post.slug);
      next[post.slug] = read.ok ? excerptFromBody(bodyOf(read.data)) : '';
    }),
  );
  excerpts.value = next;
}

function applyConfig(config: Record<string, unknown>): void {
  rawConfig.value = config;
  const site = isRecord(config.site) ? config.site : {};
  const seo = isRecord(config.seo) ? config.seo : {};
  siteTitle.value = typeof site.title === 'string' ? site.title : '';
  titleTemplate.value = typeof seo.titleTemplate === 'string' ? seo.titleTemplate : '%s';
  siteUrl.value = typeof site.url === 'string' ? site.url : '';
  siteDescription.value = typeof site.description === 'string' ? site.description : '';
  siteOgImage.value = typeof site.ogImage === 'string' ? site.ogImage : '';
}

async function load(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir) {
    report.value = null;
    posts.value = [];
    rawConfig.value = null;
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const [saved, listed, settings] = await Promise.all([
      window.xiao.seo.report(siteDir),
      window.xiao.content.list(siteDir),
      window.xiao.settings.read(siteDir),
    ]);
    report.value = saved.ok ? asReport(saved.data) : null;
    posts.value = listed.ok
      ? listed.data.map((post) => ({
          slug: post.slug,
          title: post.title,
          description: post.description,
          cover: post.cover,
          format: post.format,
        }))
      : [];
    if (settings.ok && isRecord(settings.data)) applyConfig(settings.data);
    await loadExcerpts(siteDir);
  } finally {
    loading.value = false;
  }
}

async function saveSite(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir || savingSite.value) return;
  savingSite.value = true;
  try {
    const result = await window.xiao.settings.patch(siteDir, {
      set: {
        'site.url': siteUrl.value.trim(),
        'site.description': siteDescription.value,
        'site.ogImage': siteOgImage.value.trim(),
      },
    });
    if (!result.ok) {
      notify(result.message, 'error', 'seo-site');
      return;
    }
    if (result.data.length > 0) {
      notify(`没有写入：${result.data.join('、')}`, 'error', 'seo-site');
      return;
    }
    const fresh = await window.xiao.settings.read(siteDir);
    if (fresh.ok && isRecord(fresh.data)) rawConfig.value = fresh.data;
    notify('站点设置已保存。', 'info', 'seo-site');
  } finally {
    savingSite.value = false;
  }
}

async function savePost(): Promise<void> {
  const siteDir = session.siteDir;
  const slug = openSlug.value;
  const post = posts.value.find((item) => item.slug === slug);
  if (!siteDir || !post || savingPost.value) return;
  savingPost.value = true;
  const read = await window.xiao.content.read(siteDir, slug);
  if (!read.ok) {
    savingPost.value = false;
    notify(`读不到文章：${read.message}`, 'error', 'seo-save');
    return;
  }
  const next = setField(setField(read.data, 'title', editTitle.value.trim()), 'description', editDescription.value.trim());
  const write = await window.xiao.content.write(siteDir, slug, next);
  savingPost.value = false;
  if (!write.ok) {
    notify(`没有保存：${write.message}`, 'error', 'seo-save');
    return;
  }
  post.title = editTitle.value.trim();
  post.description = editDescription.value.trim();
  if (!post.description) excerpts.value[post.slug] = excerptFromBody(bodyOf(next));
  else delete excerpts.value[post.slug];
  notify('已保存。这一行的状态已经按新内容更新。', 'info', 'seo-save');
}

function openPost(slug: string, title: string): void {
  if (!slug) return;
  const post = posts.value.find((item) => item.slug === slug);
  session.activePost = slug;
  session.activePostFormat = post?.format ?? 'markdown';
  window.dispatchEvent(new CustomEvent('xiao:open-post', { detail: { slug } }));
  notify(`已打开「${title}」。`, 'info', 'seo-fix');
}

async function runAudit(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir || auditing.value) return;
  auditing.value = true;
  errorText.value = '';
  buildLog.value = '';
  try {
    const result = await window.xiao.seo.audit(siteDir);
    if (!result.ok) {
      report.value = null;
      errorText.value = `构建未通过。\n${result.message}`;
      notify('构建未通过。', 'error', 'seo-audit');
      return;
    }
    report.value = result.data.report;
    if (result.data.buildFailed) {
      errorText.value = `构建未通过。\n${result.data.message || '构建没有完成'}`;
      buildLog.value = result.data.log || '';
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
    openSlug.value = '';
    void load();
  },
);
</script>

<template>
  <section class="seo">
    <div v-if="!session.siteDir" class="center">
      <UiEmpty
        title="还没打开站点"
        description="SEO 要读文章和站点设置。先打开一个站点，再回到这里。"
        :icon="icons.seo"
      />
    </div>

    <div v-else-if="loading" class="center">
      <UiSpinner :size="20" />
      <p class="dim">正在读取文章和站点设置…</p>
    </div>

    <template v-else>
      <header class="head">
        <h1>SEO</h1>
        <p class="dim">{{ summaryLine }}</p>
        <UiButton size="sm" :icon-left="icons.refresh" :loading="auditing" @click="runAudit">
          {{ auditing ? '正在构建并体检…' : '体检' }}
        </UiButton>
      </header>

      <p v-if="errorText" class="error-text">{{ errorText }}</p>
      <details v-if="buildLog" class="build-log">
        <summary>完整日志</summary>
        <pre>{{ buildLog }}</pre>
      </details>

      <section class="site">
        <h2>站点与首页</h2>
        <div class="site-row">
          <label for="seo-url">站点地址</label>
          <input id="seo-url" v-model="siteUrl" placeholder="https://name.github.io" />
          <span class="status" :class="urlStatus.tone">{{ urlStatus.text }}</span>
        </div>
        <div class="site-row">
          <label for="seo-description">站点简介</label>
          <input id="seo-description" v-model="siteDescription" placeholder="用 30 到 80 个字介绍这个站" />
          <span class="status" :class="descriptionStatus.tone">{{ descriptionStatus.text }}</span>
        </div>
        <div class="site-row">
          <label for="seo-og">默认分享图</label>
          <input id="seo-og" v-model="siteOgImage" placeholder="/og.png" />
          <span class="status" :class="ogStatus.tone">{{ ogStatus.text }}</span>
        </div>
        <div class="site-save">
          <UiButton size="sm" :loading="savingSite" @click="saveSite">保存站点设置</UiButton>
        </div>
      </section>

      <section class="articles">
        <div class="article-bar">
          <div class="filters">
            <button type="button" :class="{ on: filter === 'all' }" @click="filter = 'all'">全部 {{ posts.length }}</button>
            <button type="button" :class="{ on: filter === 'problem' }" @click="filter = 'problem'">有问题 {{ problemCount }}</button>
            <button type="button" :class="{ on: filter === 'ok' }" @click="filter = 'ok'">正常 {{ okCount }}</button>
          </div>
          <input v-model="query" class="search" placeholder="按标题搜索" />
        </div>
        <p class="dim">{{ report ? `生成后的页面问题来自上次体检 ${reportClock}` : '点体检检查生成后的页面' }}</p>

        <div class="table">
          <template v-for="post in visiblePosts" :key="post.slug">
            <button type="button" class="article" :class="{ open: openSlug === post.slug }" @click="toggle(post.slug)">
              <span class="dot" :class="rowLevel(post)" />
              <span class="name">{{ liveTitle(post) }}</span>
              <span class="tags">
                <span v-for="tag in tagsFor(post)" :key="tag.text" class="tag" :class="tag.level">{{ tag.text }}</span>
              </span>
            </button>
            <div v-if="openSlug === post.slug" class="editor">
              <div class="fields">
                <label>
                  <span>标题</span>
                  <input v-model="editTitle" />
                  <em :class="editTitleTone">约 {{ editTitleCount }} 字 / 建议 30 字以内</em>
                </label>
                <label>
                  <span>摘要</span>
                  <textarea v-model="editDescription" rows="3" placeholder="留空时会从正文截取" />
                  <em :class="editDescTone">
                    {{ editDescription.trim() ? `约 ${editDescCount} 字` : '没写' }} / 建议 30–80 字
                  </em>
                </label>
              </div>
              <div class="serp-wrap">
                <h3>搜索结果</h3>
                <article class="serp">
                  <p class="serp-url">{{ serpUrl(post.slug) }}</p>
                  <p class="serp-title">{{ templatedTitle(editTitle) }}</p>
                  <p class="serp-desc">{{ editDescription.trim() || excerpts[post.slug] || '（没有摘要）' }}</p>
                </article>
              </div>
              <div class="editor-actions">
                <UiButton size="sm" :loading="savingPost" @click="savePost">保存</UiButton>
                <UiButton size="sm" variant="ghost" @click="openCard(post.slug)">分享卡片</UiButton>
                <UiButton size="sm" variant="ghost" @click="openPost(post.slug, liveTitle(post))">打开文章</UiButton>
              </div>
            </div>
          </template>
          <p v-if="!visiblePosts.length" class="dim empty">没有符合条件的文章。</p>
        </div>
      </section>

      <UiDialog v-model="previewOpen" :title="previewPost ? liveTitle(previewPost) : '分享卡片'" :width="560">
        <article v-if="previewPost" class="social">
          <img v-if="previewImage" class="social-photo" :src="previewImage" alt="" />
          <div v-else class="social-image">
            <UiIcon :path="icons.image" :size="18" />
            <span>没有分享图</span>
          </div>
          <div class="social-body">
            <p class="social-title">{{ previewTitle }}</p>
            <p class="social-desc">{{ previewDescription || '（没有摘要）' }}</p>
          </div>
        </article>
      </UiDialog>
    </template>
  </section>
</template>

<style scoped>
.seo {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
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
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--ui-s3);
  align-items: baseline;
}

.head h1,
.site h2 {
  margin: 0;
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

.site h2 {
  font-size: var(--ui-fs-3);
}

.dim,
.empty {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.error-text {
  margin: 0;
  color: var(--ui-danger);
  font-size: var(--ui-fs-2);
  white-space: pre-wrap;
}

.build-log {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.build-log pre {
  max-height: 12rem;
  overflow: auto;
  white-space: pre-wrap;
}

.site,
.articles {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}

.site-row {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr) minmax(8rem, 18rem);
  gap: var(--ui-s3);
  align-items: center;
}

.site-row label {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.site-row input,
.search,
.fields input,
.fields textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text);
  font: inherit;
  font-size: var(--ui-fs-2);
}

.status,
.fields em {
  font-size: var(--ui-fs-2);
  font-style: normal;
}

.status.error,
.tag.error {
  color: var(--ui-danger);
}

.status.warn,
.fields em.warn,
.tag.warn {
  color: var(--ui-warn);
}

.status.ok,
.fields em.ok {
  color: var(--ui-ok);
}

.site-save {
  display: flex;
  justify-content: flex-end;
}

.article-bar {
  display: flex;
  gap: var(--ui-s3);
  align-items: center;
  justify-content: space-between;
}

.filters {
  display: flex;
  gap: var(--ui-s2);
}

.filters button {
  padding: 4px 8px;
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  font: inherit;
  font-size: var(--ui-fs-2);
  cursor: pointer;
}

.filters button.on {
  background: var(--ui-raise);
  color: var(--ui-text);
}

.search {
  width: 14rem;
}

.table {
  max-height: 33rem;
  overflow: auto;
  border-top: 1px solid var(--ui-line);
}

.article {
  display: grid;
  grid-template-columns: 12px minmax(8rem, 16rem) minmax(0, 1fr);
  gap: var(--ui-s3);
  align-items: center;
  width: 100%;
  height: 2.5rem;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--ui-line);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.article.open {
  background: var(--ui-raise);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ui-text-3);
}

.dot.warn {
  background: var(--ui-warn);
}

.dot.error {
  background: var(--ui-danger);
}

.dot.ok {
  background: var(--ui-ok);
}

.name {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tags {
  display: flex;
  gap: 6px;
  overflow: hidden;
}

.tag {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ui-warn-weak);
  font-size: var(--ui-fs-1);
  white-space: nowrap;
}

.tag.error {
  background: var(--ui-danger-weak);
}

.editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
  gap: var(--ui-s4);
  padding: var(--ui-s3) 0 var(--ui-s4);
  border-bottom: 1px solid var(--ui-line);
}

.fields {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fields span,
.serp-wrap h3 {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.serp-wrap h3 {
  margin: 0 0 var(--ui-s2);
  font-weight: 600;
}

.editor-actions {
  display: flex;
  grid-column: 1 / -1;
  gap: var(--ui-s2);
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
.serp-desc,
.social-desc {
  margin: 0;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.serp-title,
.social-title {
  margin: 0;
  color: var(--ui-accent);
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.social-title {
  color: var(--ui-text);
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

@media (max-width: 1024px) {
  .head,
  .site-row,
  .editor,
  .article-bar {
    grid-template-columns: minmax(0, 1fr);
  }

  .article-bar,
  .head {
    display: flex;
    flex-wrap: wrap;
  }

  .site-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
