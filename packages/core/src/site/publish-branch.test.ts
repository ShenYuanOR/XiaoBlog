import { describe, expect, it } from 'vitest';
import { chooseDefaultBranch, pushRefs } from '../../../../apps/studio/src/main/publish.ts';

describe('远端默认分支', () => {
  it('空仓库用接口给的 default_branch', () => {
    expect(chooseDefaultBranch(undefined, 'main')).toBe('main');
    expect(chooseDefaultBranch('', 'main')).toBe('main');
    expect(chooseDefaultBranch('refs/heads/master', 'main')).toBe('master');
  });

  it('本地分支不同就推到远端默认分支', () => {
    expect(pushRefs('master', 'main')).toEqual({ ref: 'master', remoteRef: 'main' });
    expect(pushRefs('main', 'main')).toEqual({ ref: 'main' });
  });
});
