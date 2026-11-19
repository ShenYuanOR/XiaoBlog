import { describe, expect, it } from 'vitest';
import { cachedCheck, checkFingerprint, retargetCache } from '../../../../apps/studio/src/main/publish-check.ts';

const porcelain = [' M src/content/posts/coffee/index.md', '?? .pnpm-store/v11/file', '?? node_modules/left-pad/index.js'].join('\n');

function statOf(size: number) {
  return (rel: string) => {
    if (rel === 'src/content/posts/coffee/index.md') return { size, mtimeMs: 1000 };
    if (rel === 'xiao.config.json') return { size: 20, mtimeMs: 50 };
    if (rel === 'src/theme.json') return { size: 8, mtimeMs: 40 };
    return null;
  };
}

describe('检查指纹', () => {
  it('内容不变时命中缓存，依赖目录不计入', () => {
    const first = checkFingerprint({ head: 'abc', porcelain, stat: statOf(12) });
    const second = checkFingerprint({
      head: 'abc',
      porcelain: ' M src/content/posts/coffee/index.md\n',
      stat: statOf(12),
    });
    expect(first).toBe(second);
    const entry = { fingerprint: first, at: 5, value: ['通过'] };
    expect(cachedCheck(entry, second)?.value).toEqual(['通过']);
  });

  it('文件大小变化后缓存失效', () => {
    const first = checkFingerprint({ head: 'abc', porcelain, stat: statOf(12) });
    const changed = checkFingerprint({ head: 'abc', porcelain, stat: statOf(13) });
    expect(changed).not.toBe(first);
    expect(cachedCheck({ fingerprint: first, at: 5, value: ['通过'] }, changed)).toBeNull();
  });

  it('提交后把同一份检查记到新指纹上', () => {
    const before = checkFingerprint({ head: 'aaa', porcelain: ' M src/a.md\n', stat: statOf(12) });
    const after = checkFingerprint({ head: 'bbb', porcelain: '', stat: statOf(12) });
    expect(after).not.toBe(before);
    const entry = retargetCache({ fingerprint: before, at: 9, value: ['通过'] }, after);
    expect(cachedCheck(entry, after)?.value).toEqual(['通过']);
    expect(cachedCheck(entry, before)).toBeNull();
  });
});
