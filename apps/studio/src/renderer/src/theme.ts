import { ref } from 'vue';

export type ThemeMode = 'system' | 'dark' | 'light';

const STORAGE_KEY = 'studio.theme';

function readMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'dark' || value === 'light' || value === 'system') return value;
  } catch {
    // localStorage 不可用时按系统走
  }
  return 'dark';
}

function systemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export const themeMode = ref<ThemeMode>(readMode());

export function applyTheme(mode: ThemeMode = themeMode.value): void {
  const dark = mode === 'dark' || (mode === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemeMode(mode: ThemeMode): void {
  themeMode.value = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // 存不了就算了，本次会话仍然生效
  }
  applyTheme(mode);
}

/** 应用启动时调用：先落地主题，避免闪白。 */
export function bootTheme(): void {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themeMode.value === 'system') applyTheme();
  });
}
