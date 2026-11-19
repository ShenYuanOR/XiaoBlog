import { describe, expect, it } from 'vitest';
import { watchIgnored } from '../../../../apps/studio/src/main/watch.ts';

describe('站点文件监视', () => {
  it('忽略体检产物、构建目录和 Astro 缓存', () => {
    expect(watchIgnored('.xiao/seo-report.json')).toBe(true);
    expect(watchIgnored('dist/index.html')).toBe(true);
    expect(watchIgnored('.astro/content.mjs')).toBe(true);
    expect(watchIgnored('src/content/posts/coffee/index.md')).toBe(false);
  });
});
