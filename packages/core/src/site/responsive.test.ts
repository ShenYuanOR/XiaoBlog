import { describe, expect, it } from 'vitest';
import { responsiveWidths, tagIssues } from '../../../../apps/studio/src/main/responsive.ts';

describe('响应式问题', () => {
  it('附上页面和视口', () => {
    expect(responsiveWidths).toEqual([360, 768, 1024, 1280, 1440]);
    expect(
      tagIssues('bad.html', 360, [{ level: 'error', rule: 'page-overflow', selector: 'html' }]),
    ).toEqual([
      { page: 'bad.html', viewport: 360, level: 'error', rule: 'page-overflow', selector: 'html' },
    ]);
  });
});
