import { readFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { xiaoMarkdownIntegration } from './src/lib/md-xiao.mjs';
import { configFieldErrors } from './src/lib/rules.mjs';
import { xiaoValidate } from './src/lib/validate.mjs';

const config = JSON.parse(readFileSync(new URL('./xiao.config.json', import.meta.url), 'utf8'));
const fields = configFieldErrors(config);
if (fields.length > 0) {
  throw new Error(`xiao.config.json 字段无效：${fields.join(', ')}`);
}

export default defineConfig({
  site: config.site.url,
  base: config.site.base,
  devToolbar: { enabled: false },
  redirects: config.redirects,
  integrations: [sitemap(), xiaoMarkdownIntegration(), xiaoValidate()],
  image: {
    layout: 'constrained',
    responsiveStyles: true,
  },
});
