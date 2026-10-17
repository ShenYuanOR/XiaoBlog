import { defineStore } from 'pinia';
import { ref } from 'vue';
import { copy } from '../copy.ts';

export const useSession = defineStore('session', () => {
  const mode = ref<'write' | 'develop'>('write');
  const nav = ref<(typeof copy.nav)[number]>('文章');
  const status = ref('正在连接');
  const logs = ref('');

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

  return { mode, nav, status, logs, load, setMode, setNav, pushLog };
});
