import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { navLabel, type NavKey } from '../copy.ts';
import { setThemeMode, themeMode, type ThemeMode } from '../theme.ts';

export type PreviewDevice = 'phone' | 'tablet' | 'pc' | 'side';
export type PreviewMode = 'off' | 'dock' | 'window';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict';
export type StudioMode = 'write' | 'develop';

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
  const previewMode = ref<PreviewMode>('off');
  const previewDevice = ref<PreviewDevice>('pc');
  const activePost = ref('');
  const activePage = ref('src/pages/index.astro');
  const devOpen = ref('');
  const drag = ref<{ kind: 'new' | 'move'; name: string; id: string } | null>(null);
  const saveState = ref<SaveState>('saved');
  const inspectorOpen = ref(true);
  const listCollapsed = ref(false);
  const building = ref(false);
  const theme = ref<ThemeMode>(themeMode.value);

  const navTitle = computed(() => navLabel(nav.value));
  const devDrawer = computed(() => mode.value === 'develop');
  const previewDocked = computed(() => previewMode.value === 'dock');

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
    nav.value = next;
  }

  function setPreviewMode(next: PreviewMode): void {
    previewMode.value = next;
  }

  function togglePreview(): void {
    previewMode.value = previewMode.value === 'dock' ? 'off' : 'dock';
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
    previewMode,
    previewDevice,
    previewDocked,
    activePost,
    activePage,
    devOpen,
    devDrawer,
    drag,
    saveState,
    inspectorOpen,
    listCollapsed,
    building,
    theme,
    load,
    setMode,
    toggleMode,
    setNav,
    setPreviewMode,
    togglePreview,
    setPreviewDevice,
    setSaveState,
    pushLog,
    setSite,
    setPage,
    editCustomCss,
    setDrag,
    setConflict,
    setTheme,
  };
});
