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

interface SeoRow {
  level: string;
  rule: string;
  detail: string;
}

interface PostItem {
  slug: string;
  title: string;
  category: string;
  draft: boolean;
}

interface PostSeo {
  slug: string;
  title: string;
  category: string;
  draft: boolean;
  titleLength: number;
  description: string;
  descriptionLength: number;
}

interface SiteInfo {
  title: string;
  description: string;
  url: string;
  ogImage: string;
}

type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

const session = useSession();

const loading = ref(false);
const errorText = ref('');
const rows = ref<SeoRow[]>([]);
const posts = ref<PostItem[]>([]);
const descriptions = ref<Record<string, string>>({});
const site = ref<SiteInfo>({ title: '', description: '', url: '', ogImage: '' });
const selectedSlug = ref('');
const openRows = ref<Record<number, boolean>>({});

const levels: Record<string, { label: string; tone: BadgeTone }> = {
  error: { label: '错误', tone: 'danger' },
  warn: { label: '警告', tone: 'warn' },
  info: { label: '提示', tone: 'neutral' },
};

const ruleHints: Record<string, string> = {
  'site.url 为空':
    '站点地址用于 canonical、sitemap 和 RSS。到「设置」里把站点地址填成部署后的完整地址（例如 https://name.github.io），再回来重新检查。',
  'slug 非法': 'slug 只能用小写字母、数字和连字符，在文章列表里重命名这篇文章即可。',
  'slug 重复': '两个文章目录用了同一个 slug，改掉其中一个的 slug，旧地址会写进重定向。',
  '站内死链': '死链需要构建后才能检查，发布前先本地构建一次；模板自带 check-rules 脚本也会查。',
  'title 超过 60 字': '搜索结果会截断过长的标题，建议把标题压到 60 字以内。',
  '文章缺 description': '摘要会用在搜索结果和分享卡片上，建议写 50–160 字。',
  'description 长度不在 50 到 160': '摘要太短或太长都会被搜索或社交平台截断，建议压到 50–160 字。',
  '文章无标签': '没有标签不影响发布，但标签页会少一个入口；可在文章属性里补标签。',
  'title 重复': '两篇标题相同会让搜索和分享卡片混淆，改其中一个标题。',
  '未设置默认分享图': '到「设置」里填分享图（ogImage），社交卡片才有图可显示。',
  '文章无分类': '没有分类不影响发布，但分类页会少一个入口；可在文章属性里补分类。',
  '图片缺 alt 或超过 2 MB': '图片 alt 和体积需要构建后检查；正文图片请补 alt、单张压到 2 MB 以内。',
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readSite(raw: Record<string, unknown>): SiteInfo {
  const rawSite = raw['site'];
  const siteRecord =
    rawSite && typeof rawSite === 'object' ? (rawSite as Record<string, unknown>) : {};
  return {
    title: text(siteRecord['title']) || session.siteTitle,
    description: text(siteRecord['description']),
    url: text(siteRecord['url']),
    ogImage: text(siteRecord['ogImage']),
  };
}

function descriptionOf(markdown: string): string {
  return markdown.match(/^description:\s*"?([^"\n]*)"?\s*$/m)?.[1]?.trim() ?? '';
}

const counts = computed(() => {
  const result = { errors: 0, warns: 0, passed: 0 };
  for (const row of rows.value) {
    if (row.level === 'error') result.errors += 1;
    else if (row.level === 'warn') result.warns += 1;
    else result.passed += 1;
  }
  return result;
});

/** 错误排前面；同一级别保持 main 进程检查的原始顺序。 */
const ruleRows = computed(() => {
  const rank = (level: string): number =>
    level === 'error' ? 0 : level === 'warn' ? 1 : 2;
  return rows.value
    .map((row, index) => ({ row, index }))
    .sort((left, right) => rank(left.row.level) - rank(right.row.level) || left.index - right.index);
});

const postSeo = computed<PostSeo[]>(() =>
  posts.value.map((post) => {
    const description = descriptions.value[post.slug] ?? '';
    return {
      ...post,
      titleLength: post.title.length,
      description,
      descriptionLength: description.length,
    };
  }),
);

const postOptions = computed(() =>
  postSeo.value.map((post) => ({
    value: post.slug,
    label: post.draft ? `${post.title}（草稿）` : post.title,
  })),
);

const slugByDetail = computed(() => {
  const map = new Map<string, string>();
  for (const post of posts.value) {
    map.set(post.title, post.slug);
    map.set(post.slug, post.slug);
  }
  return map;
});

const selectedPost = computed(
  () => postSeo.value.find((post) => post.slug === selectedSlug.value) ?? postSeo.value[0],
);

const siteUrlBase = computed(() => site.value.url.trim().replace(/\/+$/, ''));

const serpTitle = computed(() => selectedPost.value?.title || site.value.title || '未命名站点');

const serpDescription = computed(
  () =>
    selectedPost.value?.description ||
    site.value.description ||
    '还没有摘要或站点简介，搜索引擎会自己从正文里截取。',
);

const serpUrl = computed(() => {
  if (!siteUrlBase.value) return '/posts/…（先在「设置」里填站点地址）';
  return selectedPost.value
    ? `${siteUrlBase.value}/posts/${selectedPost.value.slug}/`
    : `${siteUrlBase.value}/`;
});

const descriptionState = computed<{ tone: BadgeTone; label: string }>(() => {
  const description = selectedPost.value?.description ?? '';
  if (!description) return { tone: 'danger', label: '缺少摘要' };
  if (description.length < 50)
    return { tone: 'warn', label: `摘要偏短：${description.length} 字，建议 50–160` };
  if (description.length > 160)
    return { tone: 'warn', label: `摘要偏长：${description.length} 字，建议 50–160` };
  return { tone: 'ok', label: `摘要 ${description.length} 字` };
});

function levelLabel(level: string): string {
  return levels[level]?.label ?? '提示';
}

function levelTone(level: string): BadgeTone {
  return levels[level]?.tone ?? 'neutral';
}

function hintOf(rule: string): string {
  return ruleHints[rule] ?? '按提示在文章属性或站点设置里补齐，再回来重新检查。';
}

/** 能定位到文章/设置的规则；其余是构建后检查项。 */
function fixKind(rule: string): 'post' | 'settings' | 'none' {
  if (rule === 'site.url 为空' || rule === '未设置默认分享图') return 'settings';
  if (rule === '站内死链' || rule === '图片缺 alt 或超过 2 MB') return 'none';
  return 'post';
}

function slugFor(detail: string): string {
  return slugByDetail.value.get(detail) ?? '';
}

function toggleRow(index: number): void {
  openRows.value[index] = !openRows.value[index];
}

function openPost(slug: string, title: string): void {
  if (!slug) {
    notify('这条问题不在某篇文章里，先看「设置」或构建检查项。', 'info', 'seo-fix');
    return;
  }
  session.activePost = slug;
  window.dispatchEvent(new CustomEvent('xiao:open-post', { detail: { slug } }));
  session.setNav('posts');
  notify(
    `已切到「文章」；Shell 还没接「自动打开文章」，请在左侧点选「${title}」。`,
    'info',
    'seo-fix',
  );
}

function fixPost(row: SeoRow): void {
  openPost(slugFor(row.detail), row.detail);
}

function openSettings(): void {
  session.setNav('settings');
  notify('已切到「设置」，补全站点地址或分享图后回来重新检查。', 'info', 'seo-fix');
}

function goPosts(): void {
  session.setNav('posts');
  notify('已切到「文章」，选一篇开始写或改属性。', 'info', 'seo-fix');
}

async function openSite(): Promise<void> {
  const result = await window.xiao.project.open();
  if (!result.ok) {
    notify(`打开站点失败：${result.message}`, 'error', 'seo-site');
    return;
  }
  if (!result.data) return;
  session.setSite(result.data.dir, result.data.title);
  session.setNav('seo');
}

async function load(): Promise<void> {
  const siteDir = session.siteDir;
  if (!siteDir) {
    rows.value = [];
    posts.value = [];
    descriptions.value = {};
    return;
  }
  loading.value = true;
  errorText.value = '';
  try {
    const check = await window.xiao.seo.check(siteDir);
    if (check.ok) {
      rows.value = check.data;
    } else {
      rows.value = [];
      errorText.value = `SEO 检查失败：${check.message}。确认站点文件夹还在，再点「重新检查」。`;
    }

    const listed = await window.xiao.content.list(siteDir);
    if (listed.ok) {
      posts.value = listed.data;
    } else {
      posts.value = [];
      notify(`读不到文章列表：${listed.message}`, 'error', 'seo-list');
    }

    const config = await window.xiao.settings.read(siteDir);
    site.value = config.ok
      ? readSite(config.data)
      : { title: session.siteTitle, description: '', url: '', ogImage: '' };

    const entries = await Promise.all(
      posts.value.map(async (post) => {
        const read = await window.xiao.content.read(siteDir, post.slug);
        return [post.slug, read.ok ? descriptionOf(read.data) : ''] as const;
      }),
    );
    descriptions.value = Object.fromEntries(entries);

    if (!posts.value.some((post) => post.slug === selectedSlug.value)) {
      selectedSlug.value = posts.value[0]?.slug ?? '';
    }
    openRows.value = {};
  } finally {
    loading.value = false;
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
        description="SEO 体检要读站点里的文章与配置。先新建或打开一个站点，再回到这里。"
        :icon="icons.seo"
      >
        <template #action>
          <UiButton variant="primary" @click="openSite">打开站点</UiButton>
        </template>
      </UiEmpty>
    </div>

    <div v-else-if="loading" class="center">
      <UiSpinner :size="20" />
      <p class="dim">正在检查文章与站点配置…</p>
    </div>

    <div v-else-if="errorText" class="center">
      <UiEmpty title="检查没成功" :description="errorText" :icon="icons.alert">
        <template #action>
          <UiButton @click="load">重新检查</UiButton>
        </template>
      </UiEmpty>
    </div>

    <template v-else>
      <header class="head">
        <div class="head-text">
          <h1>SEO 体检</h1>
          <p class="dim">
            检查站点地址、slug、标题与摘要；error 会在发布页挡住发布，warn 只是建议。
          </p>
        </div>
        <UiButton size="sm" :icon="icons.refresh" @click="load">重新检查</UiButton>
      </header>

      <div class="stats">
        <article class="stat is-danger">
          <span class="stat-num">{{ counts.errors }}</span>
          <span class="stat-label">错误</span>
          <span class="stat-hint">必须先修，会挡住发布</span>
        </article>
        <article class="stat is-warn">
          <span class="stat-num">{{ counts.warns }}</span>
          <span class="stat-label">警告</span>
          <span class="stat-hint">建议修，不影响发布</span>
        </article>
        <article class="stat is-ok">
          <span class="stat-num">{{ counts.passed }}</span>
          <span class="stat-label">通过</span>
          <span class="stat-hint">检查返回的提示级条目</span>
        </article>
      </div>

      <div class="columns">
        <div class="main-col">
          <UiPanel title="规则清单">
            <template #actions>
              <UiBadge :tone="counts.errors > 0 ? 'danger' : counts.warns > 0 ? 'warn' : 'ok'" dot>
                {{ rows.length }} 条
              </UiBadge>
            </template>

            <UiEmpty
              v-if="!rows.length"
              title="没有发现问题"
              description="当前检查项全部通过。之后改了文章或站点设置，回来点「重新检查」即可。"
              :icon="icons.ok"
            />

            <div v-else class="table-wrap">
              <table class="table rules">
                <thead>
                  <tr>
                    <th class="col-level">级别</th>
                    <th>规则</th>
                    <th>涉及对象</th>
                    <th class="col-action">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="item in ruleRows" :key="item.index">
                    <tr class="rule-row">
                      <td>
                        <UiBadge :tone="levelTone(item.row.level)">
                          {{ levelLabel(item.row.level) }}
                        </UiBadge>
                      </td>
                      <td>
                        <button
                          type="button"
                          class="rule-name"
                          :aria-expanded="!!openRows[item.index]"
                          @click="toggleRow(item.index)"
                        >
                          <UiIcon
                            :path="openRows[item.index] ? icons.chevronDown : icons.chevronRight"
                            :size="14"
                          />
                          <span>{{ item.row.rule }}</span>
                        </button>
                      </td>
                      <td class="detail" :title="item.row.detail">{{ item.row.detail }}</td>
                      <td class="col-action">
                        <UiButton
                          v-if="fixKind(item.row.rule) === 'post' && slugFor(item.row.detail)"
                          size="sm"
                          variant="ghost"
                          @click="fixPost(item.row)"
                        >
                          去修改
                        </UiButton>
                        <UiButton
                          v-else-if="fixKind(item.row.rule) === 'settings'"
                          size="sm"
                          variant="ghost"
                          @click="openSettings"
                        >
                          去设置
                        </UiButton>
                        <span v-else class="dim">构建后检查</span>
                      </td>
                    </tr>
                    <tr v-if="openRows[item.index]" class="hint-row">
                      <td colspan="4">
                        <p class="hint-text">{{ hintOf(item.row.rule) }}</p>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </UiPanel>

          <UiPanel title="文章 SEO 状态">
            <template #actions>
              <UiBadge tone="neutral">{{ postSeo.length }} 篇</UiBadge>
            </template>

            <div v-if="!postSeo.length" class="empty-inline">
              <p class="dim">还没有文章，先建一篇再回来检查。</p>
              <UiButton size="sm" :icon="icons.plus" @click="goPosts">去文章列表</UiButton>
            </div>

            <div v-else class="table-wrap">
              <table class="table posts">
                <thead>
                  <tr>
                    <th>文章</th>
                    <th class="col-category">分类</th>
                    <th class="col-num">标题</th>
                    <th class="col-num">摘要</th>
                    <th class="col-status">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="post in postSeo" :key="post.slug">
                    <td>
                      <button type="button" class="post-link" @click="openPost(post.slug, post.title)">
                        {{ post.title }}
                      </button>
                    </td>
                    <td class="col-category">
                      <span :class="{ dim: !post.category }">{{ post.category || '未分类' }}</span>
                    </td>
                    <td class="col-num" :class="{ bad: post.titleLength > 60 }">
                      {{ post.titleLength }} / 60
                    </td>
                    <td
                      class="col-num"
                      :class="{
                        bad: !post.description,
                        warn: !!post.description && (post.descriptionLength < 50 || post.descriptionLength > 160),
                      }"
                    >
                      {{ post.description ? `${post.descriptionLength} 字` : '缺失' }}
                    </td>
                    <td class="col-status">
                      <UiBadge :tone="post.draft ? 'neutral' : 'ok'" dot>
                        {{ post.draft ? '草稿' : '已发布' }}
                      </UiBadge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UiPanel>
        </div>

        <aside class="preview-col">
          <UiPanel title="预览">
            <div class="preview-picker">
              <UiField label="预览文章" hint="没有文章时显示站点级信息">
                <UiSelect
                  v-model="selectedSlug"
                  :options="postOptions"
                  :disabled="!postOptions.length"
                  placeholder="还没有文章"
                />
              </UiField>
            </div>

            <section class="preview-block">
              <h3 class="preview-title">Google 搜索结果</h3>
              <article class="serp">
                <p class="serp-url">{{ serpUrl }}</p>
                <p class="serp-title">{{ serpTitle }}</p>
                <p class="serp-desc">{{ serpDescription }}</p>
              </article>
              <UiBadge :tone="descriptionState.tone" dot>{{ descriptionState.label }}</UiBadge>
            </section>

            <section class="preview-block">
              <h3 class="preview-title">社交分享卡片</h3>
              <article class="social">
                <div class="social-image" :class="{ empty: !site.ogImage.trim() }">
                  <UiIcon :path="icons.image" :size="18" />
                  <span class="social-image-text">{{ site.ogImage.trim() || '未设置分享图' }}</span>
                </div>
                <div class="social-body">
                  <p class="social-site">{{ site.title || session.siteTitle || '未命名站点' }}</p>
                  <p class="social-title">{{ serpTitle }}</p>
                  <p class="social-desc">{{ serpDescription }}</p>
                </div>
              </article>
              <p class="preview-note">
                分享图取「设置 → 站点 → 分享图」。这里只是近似预览，最终由平台决定裁切。
              </p>
            </section>
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

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.stat.is-ok .stat-num {
  color: var(--ui-ok);
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-s4);
  align-items: start;
}

.main-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
  min-width: 0;
}

.preview-col {
  min-width: 0;
  position: sticky;
  top: var(--ui-s4);
}

.table-wrap {
  margin: calc(var(--ui-s1) * -1);
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ui-fs-2);
}

.table th {
  padding: var(--ui-s2) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  font-weight: 500;
  text-align: left;
  white-space: nowrap;
}

.table td {
  padding: var(--ui-s2) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-text-2);
  vertical-align: middle;
}

.table tbody tr:last-child td {
  border-bottom: 0;
}

.table tbody tr:hover td {
  background: var(--ui-hover);
}

.col-level {
  width: 72px;
}

.col-action {
  width: 92px;
  text-align: right;
  white-space: nowrap;
}

.col-category {
  width: 96px;
}

.col-num {
  width: 84px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.col-status {
  width: 84px;
}

.rule-name {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: var(--ui-fs-2);
  text-align: left;
}

.rule-name:hover {
  color: var(--ui-accent);
}

.detail {
  overflow: hidden;
  max-width: 220px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint-row td {
  padding-top: 0;
  background: var(--ui-raise);
}

.hint-text {
  margin: 0;
  padding: var(--ui-s2) 0 var(--ui-s2) var(--ui-s5);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.post-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: var(--ui-fs-2);
  text-align: left;
}

.post-link:hover {
  color: var(--ui-accent);
}

.bad {
  color: var(--ui-danger);
}

.warn {
  color: var(--ui-warn);
}

.empty-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s3);
  padding: var(--ui-s2) 0;
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
  letter-spacing: 0.04em;
}

.serp {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding: var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
}

.serp-url {
  overflow: hidden;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.serp-title {
  color: var(--ui-accent);
  font-size: var(--ui-fs-4);
  line-height: 1.3;
}

.serp-desc {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.social {
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-raise);
}

.social-image {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  height: 88px;
  padding: 0 var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.social-image.empty {
  color: var(--ui-text-3);
}

.social-image-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.social-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  padding: var(--ui-s3);
}

.social-site {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}

.social-title {
  color: var(--ui-text);
  font-size: var(--ui-fs-3);
  font-weight: 600;
}

.social-desc {
  display: -webkit-box;
  overflow: hidden;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.preview-note {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
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
