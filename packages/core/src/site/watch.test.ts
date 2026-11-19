import { describe, expect, it } from 'vitest';
import { watchDecision, watchIgnored } from '../../../../apps/studio/src/main/watch.ts';

describe('站点文件监视', () => {
  it('忽略体检产物、构建目录和 Astro 缓存', () => {
    expect(watchIgnored('.xiao/seo-report.json')).toBe(true);
    expect(watchIgnored('dist/index.html')).toBe(true);
    expect(watchIgnored('.astro/content.mjs')).toBe(true);
    expect(watchIgnored('.pnpm-store/v11/file')).toBe(true);
    expect(watchIgnored('src/content/posts/coffee/index.md')).toBe(false);
  });

  it('监视开始前就存在的文件只记基线', () => {
    expect(watchDecision({ seen: false, sameHash: false, mtimeMs: 10, startedAt: 20 })).toBe('baseline');
    expect(watchDecision({ seen: false, sameHash: false, mtimeMs: 30, startedAt: 20 })).toBe('reload');
    expect(watchDecision({ seen: true, sameHash: true, mtimeMs: 30, startedAt: 20 })).toBe('ignore');
  });
});
