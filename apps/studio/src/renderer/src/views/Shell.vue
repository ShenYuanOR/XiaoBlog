<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { copy, navItems, type NavKey } from '../copy.ts';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { concealNativePreview } from '../preview-layer.ts';
import { useSession, type PreviewDevice } from '../stores/session.ts';
import {
  UiButton,
  UiCommand,
  UiEmpty,
  UiIcon,
  UiKbd,
  UiSegmented,
  UiSpinner,
  UiTooltip,
} from '../ui/index.ts';
import Appearance from './Appearance.vue';
import Conflict from './Conflict.vue';
import Canvas from './Canvas.vue';
import DevDrawer from './DevDrawer.vue';
import PreviewHost from './PreviewHost.vue';
import Editor from './Editor.vue';
import Media from './Media.vue';
import Pages from './Pages.vue';
import Posts from './Posts.vue';
import Publish from './Publish.vue';
import Seo from './Seo.vue';
import Settings from './Settings.vue';

const session = useSession();
const router = useRouter();

const slug = ref('');
const commandOpen = ref(false);
const pendingWindow = ref(false);
const pendingPath = ref('');

const deviceItems = [
  { key: 'phone', label: '手机', icon: icons.phone },
  { key: 'tablet', label: '平板', icon: icons.tablet },
  { key: 'pc', label: '电脑', icon: icons.pc },
  { key: 'side', label: '并排', icon: icons.side },
];

const navKey = computed({
  get: () => session.nav,
  set: (value: string) => session.setNav(value as NavKey),
});

const navItem = computed(() => navItems.find((item) => item.key === session.nav));
const navOptions = navItems.map((item) => ({
  key: item.key,
  label: item.label,
  icon: icons[item.icon],
}));
const showList = computed(
  () =>
    Boolean(session.siteDir) &&
    session.mode !== 'develop' &&
    (session.nav === 'posts' || session.nav === 'pages'),
);
const layoutOpen = computed(() => session.nav === 'posts' && Boolean(session.layoutSlug));
const showCanvas = computed(
  () => Boolean(session.siteDir) && (session.nav === 'pages' || layoutOpen.value),
);
const showEditor = computed(
  () =>
    Boolean(session.siteDir) &&
    session.nav === 'posts' &&
    Boolean(slug.value) &&
    !layoutOpen.value,
);
const showInspector = computed(() => showList.value && session.inspectorOpen);
const inspectorRail = computed(() => showList.value && !session.inspectorOpen);
const hasSite = computed(() => Boolean(session.siteDir));
const listToggleLabel = computed(() => {
  const name = session.nav === 'posts' ? '文章列表' : '页面列表';
  return session.listCollapsed ? `展开${name}` : `收起${name}`;
});
const inspectorToggleLabel = computed(() => (session.inspectorOpen ? '收成窄栏' : '展开属性栏'));

const commands = computed(() => [
  ...navItems.map((item) => ({
    id: `nav:${item.key}`,
    label: `切换到${item.label}`,
    group: '视图',
    icon: icons[item.icon],
  })),
  { id: 'preview:window', label: '在独立窗口打开预览', group: '视图', icon: icons.external },
  { id: 'mode:toggle', label: session.mode === 'write' ? '进入开发者模式' : '回到创作模式', group: '视图', icon: icons.code },
  { id: 'theme:toggle', label: session.theme === 'dark' ? '切到浅色' : '切到深色', group: '外观', icon: icons.light },
  { id: 'site:open', label: '打开其他站点…', group: '站点', icon: icons.files },
  { id: 'site:welcome', label: '回到欢迎页', group: '站点', icon: icons.back },
]);

watch(commandOpen, (open) => {
  if (open) concealNativePreview();
});

function runCommand(id: string): void {
  commandOpen.value = false;
  if (id.startsWith('nav:')) session.setNav(id.slice(4) as NavKey);
  else if (id === 'preview:window') void openFormalPreview();
  else if (id === 'mode:toggle') session.toggleMode();
  else if (id === 'theme:toggle') session.setTheme(session.theme === 'dark' ? 'light' : 'dark');
  else if (id === 'site:open') void openSite();
  else if (id === 'site:welcome') void router.push('/');
}

async function openSite(): Promise<void> {
  const result = await window.xiao.project.open();
  if (!result.ok) notify(result.message, 'error');
  if (result.ok && result.data) {
    session.setSite(result.data.dir, result.data.title);
    session.setNav('posts');
  }
}

function previewHref(path = ''): string {
  const root = session.previewUrl.endsWith('/') ? session.previewUrl : `${session.previewUrl}/`;
  if (!path) return root;
  return new URL(path.replace(/^\//, ''), root).href;
}

async function showWindowPreview(path = ''): Promise<void> {
  if (!session.previewUrl) return;
  const result = await window.xiao.preview.set(
    session.previewDevice === 'side' ? 'side' : session.previewDevice,
    previewHref(path),
  );
  if (!result.ok) notify(result.message, 'error');
}

async function openFormalPreview(path: string | Event = ''): Promise<void> {
  const target = typeof path === 'string' ? path : '';
  if (!session.siteDir) {
    notify('先打开一个站点再预览。', 'error');
    return;
  }
  session.setPreviewMode('window');
  if (session.previewUrl && session.previewSiteDir === session.siteDir) {
    pendingWindow.value = false;
    pendingPath.value = '';
    await showWindowPreview(target);
    return;
  }
  pendingWindow.value = true;
  pendingPath.value = target;
  if (session.building) return;
  session.building = true;
  const result = await window.xiao.runtime.start('dev', session.siteDir);
  if (!result.ok) {
    pendingWindow.value = false;
    pendingPath.value = '';
    session.building = false;
    session.setPreviewMode('off');
    notify(`预览没能启动：${result.message}`, 'error');
  }
}

function selectPost(next: string): void {
  if (session.layoutSlug) session.closeLayout();
  slug.value = next;
}

async function toggleMode(): Promise<void> {
  session.toggleMode();
}

function onKeydown(event: KeyboardEvent): void {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    commandOpen.value = true;
    return;
  }
  if (mod && event.key.toLowerCase() === 'p') {
    event.preventDefault();
    commandOpen.value = true;
    return;
  }
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('xiao:save'));
    return;
  }
  if (mod && event.shiftKey && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    void toggleMode();
    return;
  }
  if (mod && event.shiftKey && event.key.toLowerCase() === 'v') {
    event.preventDefault();
    void openFormalPreview();
  }
}

function onOpenPost(event: Event): void {
  const detail = (event as CustomEvent<{ slug?: string }>).detail;
  if (!detail?.slug) return;
  session.setNav('posts');
  slug.value = detail.slug;
}

function onPreviewWindow(event: Event): void {
  const path = (event as CustomEvent<{ path?: string }>).detail?.path ?? '';
  void openFormalPreview(path);
}

onMounted(() => {
  void session.load();
  void window.xiao.preview.hideDock();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('xiao:open-post', onOpenPost);
  window.addEventListener('xiao:preview-window', onPreviewWindow);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('xiao:preview-window', onPreviewWindow);
  window.removeEventListener('xiao:open-post', onOpenPost);
});

watch(
  () => session.previewUrl,
  (url) => {
    if (!url || !pendingWindow.value) return;
    pendingWindow.value = false;
    const path = pendingPath.value;
    pendingPath.value = '';
    void showWindowPreview(path);
  },
);

async function choose(action: 'keep' | 'load' | 'compare'): Promise<void> {
  if (!session.conflict) return;
  if (action === 'compare') {
    session.compare = true;
    return;
  }
  await window.xiao.project.resolve(session.conflict.file, action);
  session.setConflict(null);
}

const saveText = computed(() => {
  switch (session.saveState) {
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

const previewDeviceKey = computed({
  get: () => session.previewDevice,
  set: (value: string) => session.setPreviewDevice(value as PreviewDevice),
});

const modeKey = computed({
  get: () => session.mode,
  set: (value: string) => session.setMode(value as 'write' | 'develop'),
});
</script>

<template>
  <div class="shell">
    <header class="top">
      <div class="brand">
        <span class="brand-mark">晓</span>
        <span class="brand-title" :title="session.siteDir">{{ session.siteTitle || copy.appName }}</span>
        <UiTooltip label="打开其他站点">
          <UiButton variant="ghost" size="sm" :icon="icons.chevronDown" aria-label="打开其他站点" @click="openSite" />
        </UiTooltip>
      </div>

      <UiSegmented v-model="navKey" :items="navOptions" class="nav-switch" />

      <div class="grow" />

      <UiButton variant="ghost" size="sm" class="search-btn" @click="commandOpen = true">
        <UiIcon :path="icons.seo" :size="15" />
        <span>搜索</span>
        <UiKbd>Ctrl</UiKbd><UiKbd>K</UiKbd>
      </UiButton>
      <UiTooltip :label="copy.windowPreview">
        <UiButton
          variant="ghost"
          size="sm"
          :icon="icons.external"
          :aria-label="copy.windowPreview"
          :class="{ on: session.previewWindowOpen }"
          @click="openFormalPreview()"
        />
      </UiTooltip>
      <UiTooltip :label="session.theme === 'dark' ? '切到浅色' : '切到深色'">
        <UiButton
          variant="ghost"
          size="sm"
          :icon="session.theme === 'dark' ? icons.light : icons.dark"
          aria-label="切换主题"
          @click="session.setTheme(session.theme === 'dark' ? 'light' : 'dark')"
        />
      </UiTooltip>
      <UiSegmented
        v-model="modeKey"
        :items="[
          { key: 'write', label: copy.modeWrite },
          { key: 'develop', label: copy.modeDevelop, icon: icons.code },
        ]"
      />
    </header>

    <div
      class="body"
      :class="{
        'has-list': showList && !session.listCollapsed,
        'has-inspector': showInspector,
      }"
    >
      <aside
        v-if="showList"
        class="list edge"
        :class="{ 'is-rail': session.listCollapsed }"
      >
        <UiTooltip :label="listToggleLabel">
          <UiButton
            variant="ghost"
            size="sm"
            class="edge-toggle"
            :icon="session.listCollapsed ? icons.chevronRight : icons.chevronLeft"
            :aria-label="listToggleLabel"
            @click="session.listCollapsed = !session.listCollapsed"
          />
        </UiTooltip>
        <header v-if="!session.listCollapsed" class="list-head">
          <h2>{{ navItem?.label }}</h2>
          <span class="list-hint">{{
            session.nav === 'posts' ? (layoutOpen ? '这篇的版式' : '选题写作') : '选择页面'
          }}</span>
        </header>
        <div v-show="!session.listCollapsed" class="list-body">
          <Posts v-if="session.nav === 'posts' && hasSite" :active="slug" @select="selectPost" />
          <Pages v-else-if="session.nav === 'pages' && hasSite" />
          <UiEmpty
            v-else
            :title="copy.emptyTitle"
            :description="copy.empty"
            :icon="icons.files"
          >
            <template #action>
              <UiButton variant="primary" size="sm" @click="router.push('/')">打开站点</UiButton>
            </template>
          </UiEmpty>
        </div>
      </aside>

      <main class="main">
        <div class="view-head">
          <div class="crumbs">
            <span class="crumb-muted">{{ session.siteTitle || copy.appName }}</span>
            <UiIcon :path="icons.chevronRight" :size="14" />
            <span>{{ navItem?.label }}</span>
            <template v-if="session.nav === 'posts' && slug">
              <UiIcon :path="icons.chevronRight" :size="14" />
              <span>{{ slug }}</span>
            </template>
            <template v-if="layoutOpen">
              <UiIcon :path="icons.chevronRight" :size="14" />
              <span>版式</span>
            </template>
          </div>
          <div v-if="showCanvas && !session.workbenchSource" class="view-actions">
            <UiSegmented v-model="previewDeviceKey" :items="deviceItems" />
          </div>
        </div>

        <DevDrawer v-if="session.devDrawer" class="dev-main" @close="session.setMode('write')" />
        <div
          v-show="!session.devDrawer"
          class="view-body"
          :class="{ flush: showEditor || showCanvas }"
        >
          <Editor v-if="showEditor" :site-dir="session.siteDir" :slug="slug" />
          <Canvas v-else-if="showCanvas" />
          <Media v-else-if="session.nav === 'media'" />
          <Appearance v-else-if="session.nav === 'appearance'" />
          <Settings v-else-if="session.nav === 'settings'" />
          <Seo v-else-if="session.nav === 'seo'" />
          <Publish v-else-if="session.nav === 'publish'" />
          <UiEmpty
            v-else
            :title="!hasSite ? '先打开一个站点' : session.nav === 'posts' ? '选一篇文章' : '选一个页面'"
            :description="
              !hasSite
                ? '新建一个站点，或打开已有的文件夹；文章、页面和发布入口都会在顶栏出现。'
                : session.nav === 'posts'
                  ? copy.emptyPost
                  : copy.emptyPage
            "
            :icon="!hasSite ? icons.repo : session.nav === 'posts' ? icons.posts : icons.pages"
          >
            <template #action>
              <div class="cta">
                <UiButton variant="primary" size="sm" @click="openSite">
                  {{ copy.openSite }}
                </UiButton>
                <UiButton v-if="!hasSite" size="sm" @click="router.push('/')">新建站点</UiButton>
              </div>
            </template>
          </UiEmpty>
        </div>

      </main>

      <aside v-if="showList" class="inspector edge edge-end" :class="{ 'is-rail': inspectorRail }">
        <UiTooltip :label="inspectorToggleLabel">
          <UiButton
            variant="ghost"
            size="sm"
            class="edge-toggle"
            :icon="session.inspectorOpen ? icons.chevronRight : icons.chevronLeft"
            :aria-label="inspectorToggleLabel"
            @click="session.inspectorOpen = !session.inspectorOpen"
          />
        </UiTooltip>
        <div v-if="session.inspectorOpen" id="inspector-host" class="inspector-host"></div>
      </aside>
    </div>

    <PreviewHost />

    <footer class="status">
      <span class="state" :class="session.saveState">
        <UiIcon
          :path="session.saveState === 'saved' ? icons.check : icons.alert"
          :size="13"
        />
        {{ saveText }}
      </span>
      <span v-if="session.previewUrl" class="sep">·</span>
      <span v-if="session.previewUrl" class="dim">{{ session.previewUrl }}</span>
      <span v-if="session.building" class="dim"><UiSpinner :size="12" /> 构建中…</span>
      <div class="grow" />
      <span class="dim">{{ session.status }}</span>
    </footer>

    <UiCommand v-model="commandOpen" :items="commands" @select="runCommand" />

    <Conflict
      v-if="session.conflict"
      :file="session.conflict.file"
      :mine="session.conflict.mine"
      :disk="session.conflict.disk"
      :compare="session.compare"
      @choose="choose"
    />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  /* 48 里有 1px 底边。窗口按钮只占上面 47px，底边才能从按钮下面连过去。 */
  grid-template-rows: 48px minmax(0, 1fr) 24px;
  height: 100vh;
  overflow: hidden;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.top {
  display: flex;
  align-items: center;
  gap: var(--ui-s3);
  padding: 0 var(--ui-s3);
  padding-right: max(
    138px,
    calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw))
  );
  background: var(--ui-panel);
  border-bottom: 1px solid var(--ui-line);
  -webkit-app-region: drag;
}

.top :deep(button),
.top :deep(button *),
.top :deep(input),
.top :deep(textarea),
.top :deep(select),
.top :deep(a),
.top :deep(.ui-segmented),
.top :deep(.ui-segmented *),
.top :deep(.ui-tooltip__trigger) {
  -webkit-app-region: no-drag;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-width: 0;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--ui-r-sm);
  background: var(--ui-accent-weak);
  color: var(--ui-accent);
  font-size: var(--ui-fs-2);
  font-weight: 600;
}

.brand-title {
  max-width: 140px;
  overflow: hidden;
  font-size: var(--ui-fs-3);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-switch {
  flex: 0 1 auto;
  max-width: 44vw;
  margin-left: var(--ui-s2);
  overflow-x: auto;
  scrollbar-width: none;
}

.nav-switch::-webkit-scrollbar {
  display: none;
}

.grow {
  flex: 1;
}

.search-btn {
  gap: var(--ui-s1);
  color: var(--ui-text-2);
}

.body {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}

.body.has-list {
  grid-template-columns: 272px minmax(0, 1fr);
}

.body.has-inspector {
  grid-template-columns: minmax(0, 1fr) 320px;
}

.body.has-list.has-inspector {
  grid-template-columns: 272px minmax(0, 1fr) 320px;
}

.list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-panel);
  border-right: 1px solid var(--ui-line);
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s1);
  padding: var(--ui-s2) 40px var(--ui-s2) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.list-head h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--ui-fs-2);
  font-weight: 600;
  color: var(--ui-text-2);
  letter-spacing: 0.04em;
}

.list-hint {
  font-size: var(--ui-fs-1);
  color: var(--ui-text-3);
}

.list-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--ui-s2);
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.view-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s3);
  height: 44px;
  padding: 0 var(--ui-s4);
  border-bottom: 1px solid var(--ui-line);
}

.crumbs {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  min-width: 0;
  font-size: var(--ui-fs-2);
  color: var(--ui-text-2);
  white-space: nowrap;
}

.crumb-muted {
  color: var(--ui-text-3);
}

.view-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
}

.view-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--ui-s4) var(--ui-s6);
}

.view-body.flush {
  padding: 0;
  overflow: hidden;
}

.inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-panel);
  border-left: 1px solid var(--ui-line);
}

.edge {
  position: relative;
}

.edge-toggle {
  position: absolute;
  z-index: 3;
  top: 8px;
  right: 6px;
}

.edge-end .edge-toggle {
  right: auto;
  left: 6px;
}

.edge.is-rail {
  position: absolute;
  z-index: 5;
  top: 0;
  bottom: 0;
  width: auto;
  background: transparent;
  border: 0;
  pointer-events: none;
}

.list.is-rail {
  left: 0;
}

.inspector.is-rail {
  right: 0;
}

.edge.is-rail :deep(.ui-tooltip__trigger) {
  pointer-events: auto;
}

.edge.is-rail :deep(.edge-toggle) {
  top: 8px;
  width: 32px;
  height: 32px;
  background: var(--ui-panel);
  border: 1px solid var(--ui-line);
  box-shadow: var(--ui-shadow-1);
  pointer-events: auto;
}

.list.is-rail :deep(.edge-toggle) {
  right: auto;
  left: 8px;
}

.inspector.is-rail :deep(.edge-toggle) {
  right: 8px;
  left: auto;
}

.inspector:not(.is-rail) :deep(.inspector-head) {
  padding-left: 36px;
}

.inspector-host {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.dev-main {
  flex: 1;
  min-height: 0;
}

.status {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  height: 24px;
  gap: var(--ui-s2);
  padding: 0 var(--ui-s3);
  background: var(--ui-panel);
  border-top: 1px solid var(--ui-line);
  font-size: var(--ui-fs-1);
  color: var(--ui-text-3);
}

.status .state {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  color: var(--ui-text-2);
}

.status .state.dirty,
.status .state.saving {
  color: var(--ui-warn);
}

.status .state.conflict {
  color: var(--ui-danger);
}

.status .state.saved {
  color: var(--ui-ok);
}

.status .sep {
  color: var(--ui-line-2);
}

.status .dim {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  color: var(--ui-text-3);
}

.on {
  color: var(--ui-accent);
  background: var(--ui-accent-weak);
}

.cta {
  display: flex;
  gap: var(--ui-s2);
}
</style>
