import { describe, expect, it, vi } from 'vitest';
import { parseEslint, SOURCE_SYNC_MS } from '../../../../apps/studio/src/main/develop.ts';

describe('开发者同步', () => {
  it('停手 300ms 才写盘', () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = (text: string): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => writes.push(text), SOURCE_SYNC_MS);
    };
    push('第一');
    vi.advanceTimersByTime(SOURCE_SYNC_MS - 1);
    expect(writes).toEqual([]);
    push('第二');
    vi.advanceTimersByTime(SOURCE_SYNC_MS);
    expect(writes).toEqual(['第二']);
    vi.useRealTimers();
  });

  it('能读出 ESLint 的 JSON', () => {
    const stdout = '[\n{"messages":[{"line":2,"message":"未使用"}]}]\n';
    expect(parseEslint(stdout)).toEqual([{ line: 2, message: '未使用' }]);
  });
});
