import { describe, expect, it } from 'vitest';
import { chooseDefaultBranch, pushRefs, skipPath } from '../../../../apps/studio/src/main/publish.ts';

describe('远端默认分支', () => {
  it('空仓库用接口给的 default_branch', () => {
    expect(chooseDefaultBranch(undefined, 'main')).toBe('main');
    expect(chooseDefaultBranch('', 'main')).toBe('main');
    expect(chooseDefaultBranch('refs/heads/master', 'main')).toBe('master');
  });

  it('点开头的站点文件不会被当成 .git 跳过', () => {
    expect(skipPath('.gitea/workflows/x.yml')).toBe(false);
    expect(skipPath('.github/workflows/x.yml')).toBe(false);
    expect(skipPath('.gitignore')).toBe(false);
    expect(skipPath('.git/HEAD')).toBe(true);
    expect(skipPath('.git-broken-1/HEAD')).toBe(true);
  });

  it('本地分支不同就推到远端默认分支', () => {
    expect(pushRefs('master', 'main')).toEqual({ ref: 'master', remoteRef: 'main' });
    expect(pushRefs('main', 'main')).toEqual({ ref: 'main' });
  });
});
