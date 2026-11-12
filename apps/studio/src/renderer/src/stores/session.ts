import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { navLabel, type NavKey } from '../copy.ts';
import { setThemeMode, themeMode, type ThemeMode } from '../theme.ts';

export type PreviewDevice = 'phone' | 'tablet' | 'pc' | 'side';
export type PreviewMode = 'off' | 'window';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict';
export type StudioMode = 'write' | 'develop';

/** 文章自定义版式的相对路径：src/layouts/posts/<slug>.astro。 */
export function layoutFileOf(slug: string): string {
  return `src/layouts/posts/${slug}.astro`;
}

/** 从页面文件反推版式 slug；不是文章版式时返回空串。 */
export function layoutSlugOf(file: string): string {
  const match = /^src\/layouts\/posts\/([a-z0-9]+(?:-[a-z0-9]+)*)\.astro$/.exec(
    file.replaceAll('\\', '/'),
  );
  return match?.[1] ?? '';
}

export const useSession = defineStore('session', () => {
  const mode = ref<StudioMode>('write');
  const nav = ref<NavKey>('posts');
  const status = ref('正在连接');
  const logs = ref('');
  const siteDir = ref('');
  const siteTitle = ref('');
  const conflict = ref<{ file: string; mine: string; disk: string } | null>(null);
  const compare = ref(false);
  const reloaded = ref('');
  const previewUrl = ref('');
  const previewSiteDir = ref('');
  const previewMode = ref<PreviewMode>('off');
  const previewWindowOpen = ref(false);
  const previewDevice = ref<PreviewDevice>('pc');
  const activePost = ref('');
  const activePostFormat = ref<'markdown' | 'html'>('markdown');
  const activePage = ref('src/pages/index.astro');
  /** 正在编辑的文章版式：只做标题/返回写作的来源，模式由 activePage 是否 layouts/posts 决定。 */
  const layoutSlug = ref('');
  const layoutTitle = ref('');
  const devOpen = ref('');
  const drag = ref<{ kind: 'new' | 'move'; name: string; id: string } | null>(null);
  const saveState = ref<SaveState>('saved');
  /** 属性栏默认收成窄栏；true 才展开成整栏。赋值 false 回到窄栏，不把整栏拆掉。 */
  const inspectorExpanded = ref(false);
  const inspectorOpen = computed({
    get: () => inspectorExpanded.value,
    set: (value: boolean) => {
      inspectorExpanded.value = value;
    },
  });
  const listCollapsed = ref(false);
  /** 编辑台正在看源码：页面画布收起真页面，不占工作区。 */
  const workbenchSource = ref(false);
  /** 命令面板、对话框等遮挡层的数量。大于 0 时原生预览必须让开。 */
  const overlayCount = ref(0);
  const chromeOpen = computed(() => overlayCount.value > 0);

  function pushOverlay(): void {
    overlayCount.value += 1;
  }

  function popOverlay(): void {
    if (overlayCount.value > 0) overlayCount.value -= 1;
  }
  const building = ref(false);
  const theme = ref<ThemeMode>(themeMode.value);

  const navTitle = computed(() => navLabel(nav.value));
  const devDrawer = computed(() => mode.value === 'develop');

  async function load(): Promise<void> {
    const result = await window.xiao.app.getInfo();
    status.value = result.ok
      ? result.data.packaged
        ? `${result.data.name} ${result.data.version}`
        : `${result.data.name} 开发中`
      : result.message;
  }

  function setMode(next: StudioMode): void {
    mode.value = next;
  }

  function toggleMode(): void {
    mode.value = mode.value === 'write' ? 'develop' : 'write';
  }

  function setNav(next: NavKey): void {
    workbenchSource.value = false;
    if (next !== 'posts') {
      closeLayout();
      const page = activePage.value.replaceAll('\\', '/');
      if (page.startsWith('src/layouts/posts/') || page.includes('/content/posts/')) {
        activePage.value = 'src/pages/index.astro';
      }
    }
    nav.value = next;
  }

  function setWorkbenchSource(next: boolean): void {
    workbenchSource.value = next;
  }

  function setPreviewMode(next: PreviewMode): void {
    previewMode.value = next;
  }

  function setPreviewDevice(next: PreviewDevice): void {
    previewDevice.value = next;
  }

  function setSaveState(next: SaveState): void {
    saveState.value = next;
  }

  function pushLog(text: string): void {
    logs.value = `${logs.value}${text}`.slice(-200000);
  }

  function setSite(dir: string, title: string): void {
    siteDir.value = dir;
    siteTitle.value = title;
  }

  function setPage(file: string): void {
    activePage.value = file;
  }

  /** 从文章编辑器进入它的自定义版式（activePage 由调用方一起切换）。 */
  function openLayout(slug: string, title: string): void {
    layoutSlug.value = slug;
    layoutTitle.value = title;
  }

  function closeLayout(): void {
    layoutSlug.value = '';
    layoutTitle.value = '';
  }

  function editCustomCss(): void {
    devOpen.value = 'src/styles/custom.css';
  }

  function setDrag(next: { kind: 'new' | 'move'; name: string; id: string } | null): void {
    drag.value = next;
  }

  function setConflict(next: { file: string; mine: string; disk: string } | null): void {
    conflict.value = next;
    compare.value = false;
    saveState.value = next ? 'conflict' : 'saved';
  }

  function setTheme(next: ThemeMode): void {
    theme.value = next;
    setThemeMode(next);
  }

  return {
    mode,
    nav,
    navTitle,
    status,
    logs,
    siteDir,
    siteTitle,
    conflict,
    compare,
    reloaded,
    previewUrl,
    previewSiteDir,
    previewMode,
    previewWindowOpen,
    previewDevice,
    activePost,
    activePostFormat,
    activePage,
    layoutSlug,
    layoutTitle,
    devOpen,
    devDrawer,
    drag,
    saveState,
    inspectorOpen,
    listCollapsed,
    workbenchSource,
    chromeOpen,
    building,
    theme,
    load,
    setMode,
    toggleMode,
    setNav,
    setPreviewMode,
    setPreviewDevice,
    setSaveState,
    pushLog,
    setSite,
    setPage,
    openLayout,
    closeLayout,
    editCustomCss,
    setDrag,
    setConflict,
    setTheme,
    setWorkbenchSource,
    pushOverlay,
    popOverlay,
  };
});
