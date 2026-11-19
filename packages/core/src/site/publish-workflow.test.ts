import { describe, expect, it } from 'vitest';
import { parseGitRemote } from '../../../../apps/studio/src/main/publish-workflow.ts';

describe('仓库地址', () => {
  it('解析 GitHub 地址', () => {
    expect(parseGitRemote('https://github.com/ShenYuanOR/xiao-pages-test.git')).toEqual({
      origin: 'https://github.com',
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
    });
  });
});
