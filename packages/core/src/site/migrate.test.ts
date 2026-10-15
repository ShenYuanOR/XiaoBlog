import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { migratePost } from './migrate.ts';

const corpus = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../markdown/corpus/posts/2026-08-14-hello-xiao.md',
);

describe('迁移 1.x 文章', () => {
  it('收成文件夹 slug，并保留旧路径重定向', () => {
    const source = readFileSync(corpus, 'utf8');
    const migrated = migratePost(source, '/2026-08-14-hello-xiao');
    expect(migrated.slug).toBe('hello-xiao');
    expect(migrated.markdown).toContain('你好，晓');
    expect(migrated.redirectFrom).toBe('/2026-08-14-hello-xiao');
  });
});
