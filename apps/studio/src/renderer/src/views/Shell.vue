<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { copy, navItems, type NavKey } from '../copy.ts';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
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
const dockEl = ref<HTMLElement | null>(null);
const previewNote = ref('');

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
  () => Boolean(session.siteDir) && (session.nav === 'posts' || session.nav === 'pages'),
);
const showInspector = computed(() => session.inspectorOpen && showList.value);
const listRail = computed(() => showList.value && session.listCollapsed);
const hasSite = computed(() => Boolean(session.siteDir));

const commands = computed(() => [
  ...navItems.map((item) => ({
    id: `nav:${item.key}`,
    label: `切换到${item.label}`,
    group: '视图',
    icon: icons[item.icon],
  })),
  { id: 'preview:toggle', label: session.previewDocked ? '收起预览坞' : '停靠预览', group: '视图', icon: icons.preview },
  { id: 'preview:window', label: '在独立窗口打开预览', group: '视图', icon: icons.external },
  { id: 'mode:toggle', label: session.mode === 'write' ? '进入开发者模式' : '回到创作模式', group: '视图', icon: icons.code },
  { id: 'theme:toggle', label: session.theme === 'dark' ? '切到浅色' : '切到深色', group: '外观', icon: icons.light },
  { id: 'site:open', label: '打开其他站点…', group: '站点', icon: icons.files },
  { id: 'site:welcome', label: '回到欢迎页', group: '站点', icon: icons.back },
]);

watch(commandOpen, (open) => {
  session.chromeOpen = open;
});

function runCommand(id: string): void {
  commandOpen.value = false;
  if (id.startsWith('nav:')) session.setNav(id.slice(4) as NavKey);
  else if (id === 'preview:toggle') void togglePreview();
  else if (id === 'preview:window') void openWindowPreview();
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

async function togglePreview(): Promise<void> {
  if (session.previewMode === 'dock') {
    session.setPreviewMode('off');
    await window.xiao.preview.hideDock();
    return;
  }
  session.setPreviewMode('dock');
  if (!session.previewUrl && session.siteDir) {
    previewNote.value = '正在启动预览…';
    session.building = true;
    await window.xiao.runtime.start('dev', session.siteDir);
    session.building = false;
  }
}

async function openWindowPreview(): Promise<void> {
  if (!session.previewUrl) {
    notify('预览还没启动，先在主界面停靠预览一次', 'error');
    return;
  }
  session.setPreviewMode('window');
  await window.xiao.preview.hideDock();
  const result = await window.xiao.preview.set(
    session.previewDevice === 'side' ? 'side' : session.previewDevice,
    session.previewUrl,
  );
  if (!result.ok) notify(result.message, 'error');
}

function isDesktopWidth(width: number): boolean {
  return width >= 768;
}

let frame = 0;
let observer: ResizeObserver | null = null;

function syncDock(): void {
  if (session.nav === 'pages' && !commandOpen.value) return;
  const element = dockEl.value;
  if (!element) {
    void window.xiao.preview.hideDock();
    return;
  }
  if (session.previewMode !== 'dock' || !session.previewUrl || commandOpen.value) {
    void window.xiao.preview.hideDock();
    return;
  }
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const rect = element.getBoundingClientRect();
    const device =
      session.previewDevice === 'side' || !isDesktopWidth(rect.width)
        ? (session.previewDevice === 'phone' ? 'phone' : session.previewDevice === 'tablet' ? 'tablet' : 'pc')
        : session.previewDevice;
    void window.xiao.preview.dock({
      enabled: true,
      url: session.previewUrl,
      device: device === 'side' ? 'pc' : device,
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  });
}

async function toggleMode(): Promise<void> {
  session.toggleMode();
  await nextTick();
  syncDock();
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
    void togglePreview();
  }
}

function onOpenPost(event: Event): void {
  const detail = (event as CustomEvent<{ slug?: string }>).detail;
  if (!detail?.slug) return;
  session.setNav('posts');
  slug.value = detail.slug;
}

onMounted(() => {
  void session.load();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('xiao:open-post', onOpenPost);
  observer = new ResizeObserver(syncDock);
  if (dockEl.value) observer.observe(dockEl.value);
  nextTick(syncDock);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('xiao:open-post', onOpenPost);
  observer?.disconnect();
  void window.xiao.preview.hideDock();
});

watch(
  () => [session.previewMode, session.previewDevice, session.previewUrl, commandOpen.value, session.nav],
  () => {
    void nextTick(syncDock);
    if (dockEl.value && observer) {
      observer.disconnect();
      observer.observe(dockEl.value);
    }
  },
);

watch(
  () => session.previewUrl,
  (url) => {
    if (url) previewNote.value = '';
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
  <div class="shell" :class="{ 'has-dev': session.devDrawer }">
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
      <UiTooltip :label="session.previewDocked ? copy.dockOff : copy.dockOn">
        <UiButton
          variant="ghost"
          size="sm"
          :icon="icons.preview"
          :aria-label="copy.preview"
          :class="{ on: session.previewMode !== 'off' }"
          @click="togglePreview"
        />
      </UiTooltip>
      <UiTooltip label="独立预览窗口">
        <UiButton variant="ghost" size="sm" :icon="icons.external" aria-label="独立预览窗口" @click="openWindowPreview" />
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
        'list-rail': listRail,
        'has-inspector': showInspector,
      }"
    >
      <aside v-if="showList" class="list" :class="{ collapsed: session.listCollapsed }">
        <header class="list-head">
          <template v-if="!session.listCollapsed">
            <h2>{{ navItem?.label }}</h2>
            <span class="list-hint">{{ session.nav === 'posts' ? '选题写作' : '选择页面' }}</span>
            <UiTooltip :label="session.nav === 'posts' ? '收起文章列表' : '收起页面列表'">
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.chevronLeft"
                :aria-label="session.nav === 'posts' ? '收起文章列表' : '收起页面列表'"
                @click="session.listCollapsed = true"
              />
            </UiTooltip>
          </template>
          <UiTooltip v-else :label="session.nav === 'posts' ? '展开文章列表' : '展开页面列表'">
            <UiButton
              variant="ghost"
              size="sm"
              :icon="icons.chevronRight"
              :aria-label="session.nav === 'posts' ? '展开文章列表' : '展开页面列表'"
              @click="session.listCollapsed = false"
            />
          </UiTooltip>
        </header>
        <div v-show="!session.listCollapsed" class="list-body">
          <Posts v-if="session.nav === 'posts' && hasSite" :active="slug" @select="slug = $event" />
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
          </div>
          <div class="view-actions">
            <UiSegmented v-if="session.previewMode !== 'off'" v-model="previewDeviceKey" :items="deviceItems" />
            <UiTooltip v-if="showList" :label="session.inspectorOpen ? '收起属性栏' : '展开属性栏'">
              <UiButton
                variant="ghost"
                size="sm"
                :icon="icons.list"
                :class="{ on: session.inspectorOpen }"
                :aria-label="session.inspectorOpen ? '收起属性栏' : '展开属性栏'"
                @click="session.inspectorOpen = !session.inspectorOpen"
              />
            </UiTooltip>
          </div>
        </div>

        <div
          class="view-body"
          :class="{ flush: (session.nav === 'posts' && slug) || session.nav === 'pages' }"
        >
          <Editor v-if="session.nav === 'posts' && slug && hasSite" :site-dir="session.siteDir" :slug="slug" />
          <Canvas v-else-if="session.nav === 'pages' && hasSite" />
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

        <div
          v-if="session.previewMode === 'dock' && session.nav !== 'pages'"
          class="dock"
          :class="{ live: !!session.previewUrl }"
        >
          <div ref="dockEl" class="dock-frame">
            <UiEmpty
              v-if="!session.previewUrl"
              :title="copy.emptyPreview"
              :description="previewNote || '点击顶栏的预览按钮会启动 dev 服务器'"
              :icon="icons.pc"
            >
              <template #action>
                <UiButton variant="primary" size="sm" :loading="session.building" @click="togglePreview">
                  {{ copy.startPreview }}
                </UiButton>
              </template>
            </UiEmpty>
          </div>
        </div>
      </main>

      <aside v-if="showInspector" class="inspector">
        <div id="inspector-host" class="inspector-host"></div>
      </aside>
    </div>

    <section v-if="session.devDrawer" class="dev-drawer">
      <DevDrawer @close="session.setMode('write')" />
    </section>

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
  grid-template-rows: 48px minmax(0, 1fr) 24px;
  height: 100vh;
  overflow: hidden;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.shell.has-dev {
  grid-template-rows: 48px minmax(0, 1fr) auto 24px;
}

.top {
  display: flex;
  align-items: center;
  gap: var(--ui-s3);
  padding: 0 var(--ui-s3);
  background: var(--ui-panel);
  border-bottom: 1px solid var(--ui-line);
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
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}

.body.has-list {
  grid-template-columns: 272px minmax(0, 1fr);
}

.body.list-rail {
  grid-template-columns: 44px minmax(0, 1fr);
}

.body.has-inspector {
  grid-template-columns: minmax(0, 1fr) 320px;
}

.body.has-list.has-inspector {
  grid-template-columns: 272px minmax(0, 1fr) 320px;
}

.body.list-rail.has-inspector {
  grid-template-columns: 44px minmax(0, 1fr) 320px;
}

.list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-panel);
  border-right: 1px solid var(--ui-line);
}

.list.collapsed {
  width: 44px;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s1);
  padding: var(--ui-s2) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.list.collapsed .list-head {
  justify-content: center;
  padding: var(--ui-s2) 0;
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

.dock {
  position: relative;
  height: 42%;
  min-height: 180px;
  border-top: 1px solid var(--ui-line);
  background: var(--ui-bg);
}

.dock-frame {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.inspector {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--ui-panel);
  border-left: 1px solid var(--ui-line);
}

.inspector-host {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.dev-drawer {
  height: 40vh;
  min-height: 220px;
  overflow: hidden;
  border-top: 1px solid var(--ui-line);
  background: var(--ui-panel);
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
