import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 4488,
    fs: { allow: [path.resolve(root, '../..')] },
  },
});
