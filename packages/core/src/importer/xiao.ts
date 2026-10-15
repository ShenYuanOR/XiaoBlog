import { join } from 'node:path';
import { asText, slugFromFile, slugFromTitle } from './common.ts';
import { readPosts } from './hexo.ts';
import type { MigratedPost, MigrationSource } from './types.ts';

/**
 * XiaoBlog 1.x：docs/posts/YYYY-MM-DD-<slug>.md。
 * 公开 URL 已是 /posts/<slug>；日期文件名仍作为旧路径登记。
 * 图片来自 public/images/<slug>/，缺失时回退到 posts/_assets/<slug>/。
 */
export function scanXiao(source: MigrationSource): MigratedPost[] {
  const assetsDir = source.assetsDir ?? join(source.postsDir, '_assets');
  return readPosts({ ...source, assetsDir }, (fileBase, data, title) => {
    const declared = asText(data.slug);
    const slug =
      (declared && slugFromFile(declared)) ||
      slugFromFile(fileBase) ||
      (title ? slugFromTitle(title) : '');
    const legacyPaths = fileBase !== slug ? [`/${fileBase}`, `/posts/${fileBase}`] : [];
    return {
      slug,
      category: asText(data.category) || undefined,
      legacyPaths,
      oldUrl: undefined,
    };
  });
}

export type { MigratedPost };
