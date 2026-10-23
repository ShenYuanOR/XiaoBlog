import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// compiler-rs 的 .node 必须留在自己的包目录里。打进主进程后相对路径会失效。
const nativeExternal = ['@astrojs/compiler-rs', '@astrojs/compiler-binding'];

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
    resolve: {
      alias: { '@': resolve('src/renderer/src') },
    },
    plugins: [vue()],
  },
});
