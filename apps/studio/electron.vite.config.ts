import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// compiler-rs 的 .node 必须留在自己的包目录里。打进主进程后相对路径会失效。
const nativeExternal = ['@astrojs/compiler-rs', '@astrojs/compiler-binding'];
const port = Number(process.env.PORT || process.env.DEV_PORT || '');
const host = process.env.HOST || '127.0.0.1';
if (port > 0) {
  // 覆盖可能从其他 Electron/Vite 项目泄漏的地址。
  process.env.ELECTRON_RENDERER_URL = `http://${host}:${port}`;
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@xiao/core'] })],
    build: { rollupOptions: { external: nativeExternal } },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@xiao/core'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          preview: resolve('src/preload/preview.ts'),
          'preview-chrome': resolve('src/preload/preview-chrome.ts'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    ...(port > 0 ? { server: { host, port, strictPort: true } } : {}),
    resolve: {
      alias: { '@': resolve('src/renderer/src') },
    },
    plugins: [vue()],
  },
});
