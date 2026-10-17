import { defineStore } from 'pinia';
import { ref } from 'vue';
import { copy } from '../copy.ts';

export const useSession = defineStore('session', () => {
  const mode = ref<'write' | 'develop'>('write');
  const nav = ref<(typeof copy.nav)[number]>('文章');
  const status = ref('正在连接');
  const logs = ref('');
  const siteDir = ref('');
  const siteTitle = ref('');
  const conflict = ref<{ file: string; mine: string; disk: string } | null>(null);
  const compare = ref(false);
  const reloaded = ref('');
  const previewUrl = ref('');

  async function load(): Promise<void> {
    const result = await window.xiao.app.getInfo();
    status.value = result.ok
      ? result.data.packaged
        ? `${result.data.name} ${result.data.version}`
        : `${result.data.name} 开发中`
      : result.message;
  }

  function setMode(next: 'write' | 'develop'): void {
    mode.value = next;
  }

  function setNav(next: (typeof copy.nav)[number]): void {
    nav.value = next;
  }

  function pushLog(text: string): void {
    logs.value = `${logs.value}${text}`.slice(-8000);
  }

  function setSite(dir: string, title: string): void {
    siteDir.value = dir;
    siteTitle.value = title;
  }

  function setConflict(next: { file: string; mine: string; disk: string } | null): void {
    conflict.value = next;
    compare.value = false;
  }

  return {
    mode,
    nav,
    status,
    logs,
    siteDir,
    siteTitle,
    conflict,
    compare,
    reloaded,
    previewUrl,
    load,
    setMode,
    setNav,
    pushLog,
    setSite,
    setConflict,
  };
});
