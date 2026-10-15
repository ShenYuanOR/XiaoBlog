import { xiaoLocPlugin } from '@xiao/core/loc';
import { defineConfig } from 'astro/config';

export default defineConfig({
  vite: {
    plugins: [xiaoLocPlugin()],
  },
});
