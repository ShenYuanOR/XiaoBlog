import { describe, expect, it } from 'vitest';
import { planUpdate } from '../../../../apps/studio/src/main/update.ts';

describe('更新检查', () => {
  it('假版本 0.1.0 到 0.2.0 会询问，相同或更旧不问', () => {
    expect(planUpdate('0.1.0', '0.2.0')).toEqual({ ask: true, from: '0.1.0', to: '0.2.0' });
    expect(planUpdate('0.2.0', '0.2.0').ask).toBe(false);
    expect(planUpdate('0.3.0', '0.2.0').ask).toBe(false);
    expect(planUpdate('0.1.0', null).ask).toBe(false);
  });
});
