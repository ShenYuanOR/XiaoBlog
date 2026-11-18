<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
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
  UiPanel,
  UiSelect,
  UiSpinner,
  UiSwitch,
  UiTextarea,
} from '../ui/index.ts';

/**
 * 设置页：只放站点信息 / 作者 / 导航 / 统计 / 许可 / 重定向。
 * 主题（预设、色相、字体、宽度…）归「外观」页，这里不再出现 theme 字段。
 * 保存走 window.xiao.settings.write，整份 xiao.config.json 落盘，未识别的字段原样保留。
 */

interface NavRow {
  id: number;
  label: string;
  href: string;
}

interface RedirectRow {
  id: number;
  from: string;
  to: string;
}

interface SettingsForm {
  site: {
    url: string;
    base: string;
    lang: string;
    title: string;
    subtitle: string;
    description: string;
    favicon: string;
    ogImage: string;
    since: number;
  };
  author: { name: string; avatar: string; bio: string; email: string };
  nav: NavRow[];
  analytics: { provider: string; id: string };
  license: { enabled: boolean; name: string; url: string };
  redirects: RedirectRow[];
}

const PROVIDER_OPTIONS = [
  { value: 'none', label: '不接入统计' },
  { value: 'umami', label: 'Umami' },
  { value: 'plausible', label: 'Plausible' },
  { value: 'cloudflare', label: 'Cloudflare Web Analytics' },
];

const session = useSession();

const state = ref<'loading' | 'ready' | 'error'>('loading');
const errorText = ref('');
const saving = ref(false);
const rejected = ref<string[]>([]);
const rawConfig = ref<Record<string, unknown> | null>(null);
const savedSnapshot = ref('');
const loaded = ref(false);
const errors = ref<Record<string, string>>({});
let nextRowId = 1;

const form = reactive<SettingsForm>({
  site: {
    url: '',
    base: '/',
    lang: 'zh-CN',
    title: '',
    subtitle: '',
    description: '',
    favicon: '/favicon.svg',
    ogImage: '',
    since: 2026,
  },
  author: { name: '', avatar: '', bio: '', email: '' },
  nav: [],
  analytics: { provider: 'none', id: '' },
  license: { enabled: true, name: '', url: '' },
  redirects: [],
});

const REJECT_LABELS: Record<string, string> = {
  version: '配置版本号',
  'site.url': '站点地址',
  'site.base': '站点 base 路径',
  'site.lang': '站点语言',
  'site.title': '站点标题',
  'site.description': '站点简介',
  'theme.hue': '色相（主题字段，请到外观页修改）',
  'posts.pageSize': '每页篇数',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function rowId(): number {
  nextRowId += 1;
  return nextRowId;
}

function snapshot(): string {
  return JSON.stringify({
    site: { ...form.site },
    author: { ...form.author },
    nav: form.nav.map((row) => ({ label: row.label, href: row.href })),
    analytics: { ...form.analytics },
    license: { ...form.license },
    redirects: form.redirects.map((row) => ({ from: row.from, to: row.to })),
  });
}

const dirty = computed(() => loaded.value && snapshot() !== savedSnapshot.value);

const providerOptions = computed(() => {
  const current = form.analytics.provider;
  if (!current || PROVIDER_OPTIONS.some((option) => option.value === current)) {
    return PROVIDER_OPTIONS;
  }
  return [...PROVIDER_OPTIONS, { value: current, label: `${current}（当前值）` }];
});

function buildNav(value: unknown): NavRow[] {
  if (!Array.isArray(value)) return [];
  const rows: NavRow[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    rows.push({
      id: rowId(),
      label: textOf(item.label),
      href: textOf(item.href),
    });
  }
  return rows;
}

function buildRedirects(value: unknown): RedirectRow[] {
  if (!isRecord(value)) return [];
  const rows: RedirectRow[] = [];
  for (const [from, to] of Object.entries(value)) {
    if (typeof to !== 'string') continue;
    rows.push({ id: rowId(), from, to });
  }
  return rows;
}

function fillForm(config: Record<string, unknown>): void {
  const site = isRecord(config.site) ? config.site : {};
  const author = isRecord(config.author) ? config.author : {};
  const analytics = isRecord(config.analytics) ? config.analytics : {};
  const posts = isRecord(config.posts) ? config.posts : {};
  const license = isRecord(posts.license) ? posts.license : {};

  form.site = {
    url: textOf(site.url),
    base: textOf(site.base, '/'),
    lang: textOf(site.lang, 'zh-CN'),
    title: textOf(site.title),
    subtitle: textOf(site.subtitle),
    description: textOf(site.description),
    favicon: textOf(site.favicon, '/favicon.svg'),
    ogImage: textOf(site.ogImage),
    since:
      typeof site.since === 'number' && Number.isFinite(site.since) ? site.since : 2026,
  };
  form.author = {
    name: textOf(author.name),
    avatar: textOf(author.avatar),
    bio: textOf(author.bio),
    email: textOf(author.email),
  };
  form.nav = buildNav(config.nav);
  form.analytics = {
    provider: textOf(analytics.provider, 'none') || 'none',
    id: textOf(analytics.id),
  };
  form.license = {
    enabled: typeof license.enabled === 'boolean' ? license.enabled : true,
    name: textOf(license.name),
    url: textOf(license.url),
  };
  form.redirects = buildRedirects(config.redirects);
}

async function load(): Promise<void> {
  if (!session.siteDir) {
    state.value = 'error';
    return;
  }
  state.value = 'loading';
  errorText.value = '';
  rejected.value = [];
  errors.value = {};
  const result = await window.xiao.settings.read(session.siteDir);
  if (!result.ok) {
    state.value = 'error';
    errorText.value = result.message;
    loaded.value = false;
    session.setSaveState('saved');
    return;
  }
  const config = isRecord(result.data) ? result.data : {};
  rawConfig.value = config;
  fillForm(config);
  savedSnapshot.value = snapshot();
  loaded.value = true;
  session.setSaveState('saved');
  state.value = 'ready';
}

function validate(): boolean {
  const next: Record<string, string> = {};
  if (!form.site.title.trim()) next['site.title'] = '站点标题不能为空。';
  if (!/^https?:\/\//i.test(form.site.url.trim())) {
    next['site.url'] = '站点地址要以 http:// 或 https:// 开头，例如 https://example.com。';
  }
  if (!form.site.base.trim()) next['site.base'] = 'base 路径不能为空，通常是 /。';
  if (!form.site.lang.trim()) next['site.lang'] = '语言不能为空，例如 zh-CN。';
  if (!form.site.description.trim()) next['site.description'] = '站点简介不能为空（也会用于 SEO 摘要）。';
  if (!Number.isInteger(form.site.since) || form.site.since < 1970 || form.site.since > 2100) {
    next['site.since'] = '起始年份要填 1970–2100 之间的整数，例如 2026。';
  }
  form.nav.forEach((row, index) => {
    if (!row.label.trim()) next[`nav.${row.id}.label`] = `第 ${index + 1} 行导航缺标签。`;
    if (!row.href.trim() || !row.href.trim().startsWith('/')) {
      next[`nav.${row.id}.href`] = `第 ${index + 1} 行导航地址要以 / 开头。`;
    }
  });
  const froms = new Set<string>();
  form.redirects.forEach((row, index) => {
    const from = row.from.trim();
    const to = row.to.trim();
    if (!from.startsWith('/')) next[`redirect.${row.id}.from`] = `第 ${index + 1} 条重定向的旧地址要以 / 开头。`;
    if (!to) next[`redirect.${row.id}.to`] = `第 ${index + 1} 条重定向缺新地址。`;
    if (from && froms.has(from)) next[`redirect.${row.id}.from`] = `旧地址 ${from} 重复。`;
    if (from) froms.add(from);
  });
  errors.value = next;
  return Object.keys(next).length === 0;
}

function buildConfig(): Record<string, unknown> {
  const base = rawConfig.value ?? {};
  const rawSite = isRecord(base.site) ? base.site : {};
  const rawAuthor = isRecord(base.author) ? base.author : {};
  const rawAnalytics = isRecord(base.analytics) ? base.analytics : {};
  const rawPosts = isRecord(base.posts) ? base.posts : {};
  const rawLicense = isRecord(rawPosts.license) ? rawPosts.license : {};
  return {
    ...base,
    site: { ...rawSite, ...form.site },
    author: { ...rawAuthor, ...form.author },
    nav: form.nav.map((row) => ({ label: row.label.trim(), href: row.href.trim() })),
    analytics: {
      ...rawAnalytics,
      provider: form.analytics.provider,
      id: form.analytics.id.trim(),
    },
    posts: {
      ...rawPosts,
      license: {
        ...rawLicense,
        enabled: form.license.enabled,
        name: form.license.name.trim(),
        url: form.license.url.trim(),
      },
    },
    redirects: Object.fromEntries(
      form.redirects.map((row) => [row.from.trim(), row.to.trim()]),
    ),
  };
}

async function save(): Promise<void> {
  if (saving.value || !loaded.value || !session.siteDir) return;
  if (!validate()) {
    notify('还有字段没填对，按红色提示改完再保存。', 'error', 'settings-save');
    rejected.value = [];
    return;
  }
  const next = buildConfig();
  // 写盘期间用户可能继续编辑；用开始写盘时的快照，避免把后续改动误标成已保存。
  const snapshotAtSave = snapshot();
  saving.value = true;
  rejected.value = [];
  session.setSaveState('saving');
  const result = await window.xiao.settings.write(session.siteDir, next);
  saving.value = false;
  if (!result.ok) {
    session.setSaveState('dirty');
    notify(result.message, 'error', 'settings-save');
    return;
  }
  if (result.data.length > 0) {
    rejected.value = result.data;
    session.setSaveState('dirty');
    const labels = result.data.map((item) => REJECT_LABELS[item] ?? item).join('、');
    notify(`没有写入：${labels}。检查这些字段后重试。`, 'error', 'settings-save');
    return;
  }
  rawConfig.value = next;
  savedSnapshot.value = snapshotAtSave;
  session.setSaveState(dirty.value ? 'dirty' : 'saved');
  notify('已写入，重新构建后生效', 'info', 'settings-save');
}

function resetDraft(): void {
  if (!rawConfig.value) return;
  fillForm(rawConfig.value);
  errors.value = {};
  rejected.value = [];
  session.setSaveState('saved');
}

async function reload(): Promise<void> {
  if (dirty.value) {
    notify('有未保存改动：先保存或点“还原”再重新读取磁盘。', 'error', 'settings-save');
    return;
  }
  await load();
}

function addNav(): void {
  form.nav.push({ id: rowId(), label: '', href: '/' });
}

function removeNav(index: number): void {
  form.nav.splice(index, 1);
}

function addRedirect(): void {
  form.redirects.push({ id: rowId(), from: '/', to: '/' });
}

function removeRedirect(index: number): void {
  form.redirects.splice(index, 1);
}

function navError(row: NavRow, field: 'label' | 'href'): string {
  return errors.value[`nav.${row.id}.${field}`] ?? '';
}

function redirectError(row: RedirectRow, field: 'from' | 'to'): string {
  return errors.value[`redirect.${row.id}.${field}`] ?? '';
}

function onSaveShortcut(): void {
  if (dirty.value) void save();
}

watch(dirty, (value) => {
  if (!saving.value) session.setSaveState(value ? 'dirty' : 'saved');
});

watch(
  form,
  () => {
    if (Object.keys(errors.value).length > 0) validate();
  },
  { deep: true },
);

watch(
  () => session.siteDir,
  () => void load(),
);

onMounted(() => {
  window.addEventListener('xiao:save', onSaveShortcut);
  void load();
});

onBeforeUnmount(() => {
  window.removeEventListener('xiao:save', onSaveShortcut);
});
</script>

<template>
  <section class="settings">
    <UiEmpty
      v-if="!session.siteDir"
      title="先打开一个站点"
      description="设置会写进站点的 xiao.config.json；打开站点后就能编辑站点信息、作者、导航和重定向。"
      :icon="icons.settings"
    />

    <div v-else-if="state === 'loading'" class="state" role="status">
      <UiSpinner :size="18" label="读取配置" />
      <span>正在读取站点配置…</span>
    </div>

    <UiEmpty
      v-else-if="state === 'error'"
      title="读不到站点配置"
      :description="
        errorText
          ? `发生了什么：${errorText}。怎么办：确认站点文件夹里有 xiao.config.json，或从欢迎页重新打开站点。`
          : '发生了什么：站点目录为空。怎么办：从欢迎页重新打开站点。'
      "
      :icon="icons.alert"
    >
      <template #action>
        <UiButton variant="primary" size="sm" @click="load">重试</UiButton>
      </template>
    </UiEmpty>

    <div v-else class="settings-body">
      <header class="page-head">
        <div class="page-titles">
          <h2>设置</h2>
          <p>站点信息、作者、导航、统计、许可与重定向。主题相关的内容在「外观」页。</p>
        </div>
        <div class="page-actions">
          <UiBadge :tone="dirty ? 'warn' : 'ok'" dot>{{ dirty ? '有未保存改动' : '已保存' }}</UiBadge>
          <UiButton
            :icon="icons.refresh"
            aria-label="重新读取磁盘上的配置"
            :disabled="saving"
            @click="reload"
          />
          <UiButton :disabled="!dirty || saving" @click="resetDraft">还原</UiButton>
          <UiButton variant="primary" :icon-left="icons.save" :loading="saving" :disabled="!dirty" @click="save">
            保存
          </UiButton>
        </div>
      </header>

      <div v-if="rejected.length" class="alert" role="alert">
        <UiIcon :path="icons.alert" :size="16" />
        <div>
          <strong>没有写入，这些字段被拒绝：</strong>
          <ul>
            <li v-for="field in rejected" :key="field">{{ REJECT_LABELS[field] ?? field }}</li>
          </ul>
          <span>改好后再点保存；配置文件没有被改动。</span>
        </div>
      </div>

      <UiPanel title="站点">
        <div class="field-grid">
          <UiField label="标题" required :error="errors['site.title']">
            <UiInput v-model="form.site.title" placeholder="我的笔记" />
          </UiField>
          <UiField label="副标题">
            <UiInput v-model="form.site.subtitle" placeholder="随手记" />
          </UiField>
          <UiField
            id="setting-url"
            label="站点地址"
            required
            hint="部署后的完整地址，用于 canonical、RSS 和 sitemap。"
            :error="errors['site.url']"
          >
            <UiInput v-model="form.site.url" placeholder="https://example.com" />
          </UiField>
          <UiField label="base 路径" required hint="部署在子路径时填写，通常是 /。" :error="errors['site.base']">
            <UiInput v-model="form.site.base" placeholder="/" />
          </UiField>
          <UiField label="语言" required hint="例如 zh-CN、en。" :error="errors['site.lang']">
            <UiInput v-model="form.site.lang" placeholder="zh-CN" />
          </UiField>
          <UiField label="起始年份" :error="errors['site.since']">
            <UiInput v-model.number="form.site.since" type="number" min="1970" max="2100" />
          </UiField>
          <UiField label="图标路径" hint="public 里的相对路径，例如 /favicon.svg。">
            <UiInput v-model="form.site.favicon" placeholder="/favicon.svg" />
          </UiField>
          <UiField id="setting-ogImage" label="默认分享图" hint="留空则不输出 og:image。">
            <UiInput v-model="form.site.ogImage" placeholder="/og.png" />
          </UiField>
          <div class="span-2">
            <UiField label="简介" required hint="搜索结果与 RSS 的默认摘要。" :error="errors['site.description']">
              <UiTextarea v-model="form.site.description" :rows="3" placeholder="一个用 Astro 搭建的笔记站。" />
            </UiField>
          </div>
        </div>
      </UiPanel>

      <UiPanel title="作者">
        <div class="field-grid">
          <UiField label="名字">
            <UiInput v-model="form.author.name" placeholder="晓" />
          </UiField>
          <UiField label="邮箱" hint="只写进配置，不会自动公开。">
            <UiInput v-model="form.author.email" type="email" placeholder="you@example.com" />
          </UiField>
          <UiField label="头像" hint="站点内相对路径或完整图片地址。">
            <UiInput v-model="form.author.avatar" placeholder="/avatar.png" />
          </UiField>
          <div class="span-2">
            <UiField label="简介">
              <UiTextarea v-model="form.author.bio" :rows="3" placeholder="在这里写笔记。" />
            </UiField>
          </div>
        </div>
      </UiPanel>

      <UiPanel title="导航">
        <template #actions>
          <UiButton size="sm" :icon-left="icons.plus" @click="addNav">新增一行</UiButton>
        </template>
        <p class="section-lead">站点顶栏的顺序就是这里的顺序；地址以 / 开头。</p>
        <div v-if="form.nav.length" class="list-editor">
          <div v-for="(row, index) in form.nav" :key="row.id" class="list-row-wrap">
            <div class="list-row">
              <span class="row-index">{{ index + 1 }}</span>
              <UiInput v-model="row.label" size="sm" placeholder="标签，例如 归档" aria-label="导航标签" />
              <UiInput v-model="row.href" size="sm" placeholder="/archives" aria-label="导航地址" />
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.trash"
                aria-label="删除这一行导航"
                @click="removeNav(index)"
              />
            </div>
            <p v-if="navError(row, 'label') || navError(row, 'href')" class="row-error" role="alert">
              {{ navError(row, 'label') || navError(row, 'href') }}
            </p>
          </div>
        </div>
        <p v-else class="empty-row">还没有导航项；站点顶栏会保持空白。</p>
      </UiPanel>

      <UiPanel title="统计">
        <div class="field-grid">
          <UiField label="服务商" hint="只写进配置，是否注入取决于站点模板。">
            <UiSelect v-model="form.analytics.provider" :options="providerOptions" />
          </UiField>
          <UiField label="站点 ID" hint="Umami 的 website id、Plausible 的域名或 Cloudflare 的 token。">
            <UiInput v-model="form.analytics.id" placeholder="不需要就留空" />
          </UiField>
        </div>
      </UiPanel>

      <UiPanel title="许可">
        <div class="field-grid">
          <UiField label="显示许可" hint="文章页底部显示许可协议。">
            <div class="switch-row">
              <UiSwitch v-model="form.license.enabled" />
              <span>{{ form.license.enabled ? '显示' : '不显示' }}</span>
            </div>
          </UiField>
          <UiField label="协议名称">
            <UiInput v-model="form.license.name" placeholder="CC BY-NC-SA 4.0" />
          </UiField>
          <div class="span-2">
            <UiField label="协议地址">
              <UiInput v-model="form.license.url" placeholder="https://creativecommons.org/licenses/by-nc-sa/4.0/" />
            </UiField>
          </div>
        </div>
      </UiPanel>

      <UiPanel title="重定向">
        <template #actions>
          <UiButton size="sm" :icon-left="icons.plus" @click="addRedirect">新增一条</UiButton>
        </template>
        <p class="section-lead">旧地址 → 新地址，构建时会写进 Astro 的 redirects，保存后重新构建生效。</p>
        <div v-if="form.redirects.length" class="list-editor">
          <div v-for="(row, index) in form.redirects" :key="row.id" class="list-row-wrap">
            <div class="list-row">
              <span class="row-index">{{ index + 1 }}</span>
              <UiInput v-model="row.from" size="sm" placeholder="/旧地址" aria-label="旧地址" />
              <UiIcon :path="icons.chevronRight" :size="14" class="row-arrow" />
              <UiInput v-model="row.to" size="sm" placeholder="/posts/新地址/" aria-label="新地址" />
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.trash"
                aria-label="删除这一条重定向"
                @click="removeRedirect(index)"
              />
            </div>
            <p v-if="redirectError(row, 'from') || redirectError(row, 'to')" class="row-error" role="alert">
              {{ redirectError(row, 'from') || redirectError(row, 'to') }}
            </p>
          </div>
        </div>
        <p v-else class="empty-row">没有重定向：旧链接会直接 404。</p>
      </UiPanel>
    </div>
  </section>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--ui-text);
}

.state {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s8);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

.settings-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s4);
  max-width: 960px;
  padding-bottom: var(--ui-s8);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-s4);
  flex-wrap: wrap;
}

.page-titles h2 {
  margin: 0 0 var(--ui-s1);
  font-size: var(--ui-fs-5);
  font-weight: 600;
}

.page-titles p {
  max-width: 56ch;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.page-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.alert {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  padding: var(--ui-s3);
  border: 1px solid var(--ui-danger-weak);
  border-radius: var(--ui-r);
  background: var(--ui-danger-weak);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
}

.alert ul {
  margin: var(--ui-s1) 0;
  padding-left: var(--ui-s4);
  color: var(--ui-text-2);
}

.alert span {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s3) var(--ui-s4);
}

.span-2 {
  grid-column: 1 / -1;
}

.section-lead {
  margin-bottom: var(--ui-s3);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.list-editor {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}

.list-row-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
}

.list-row {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.row-index {
  flex: none;
  width: var(--ui-s4);
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  text-align: right;
}

.row-arrow {
  flex: none;
  color: var(--ui-text-3);
}

.row-error {
  margin-left: calc(var(--ui-s4) + var(--ui-s2));
  color: var(--ui-danger);
  font-size: var(--ui-fs-1);
}

.empty-row {
  padding: var(--ui-s3);
  border: 1px dashed var(--ui-line-2);
  border-radius: var(--ui-r);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
}

.switch-row {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: var(--ui-h-md);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
}

@media (max-width: 900px) {
  .field-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
