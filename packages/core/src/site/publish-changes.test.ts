import { describe, expect, it } from 'vitest';
import { usablePostTitle } from '../../../../apps/studio/src/main/publish-changes.ts';

describe('改动标题', () => {
  it('开头信息写坏时用目录名', () => {
    expect(usablePostTitle('[坏', 'coffee')).toBe('coffee');
    expect(usablePostTitle('咖啡', 'coffee')).toBe('咖啡');
  });
});
