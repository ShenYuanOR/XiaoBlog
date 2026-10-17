import { describe, expect, it } from 'vitest';
import { fail, ok } from './ipc-types.ts';

describe('IPC 结果', () => {
  it('成功只带 data', () => {
    expect(ok({ name: '晓' })).toEqual({ ok: true, data: { name: '晓' } });
  });

  it('失败带中文说明，没有细节时不放 detail', () => {
    expect(fail('APP_INFO', '读不到应用信息')).toEqual({
      ok: false,
      code: 'APP_INFO',
      message: '读不到应用信息',
    });
  });
});
