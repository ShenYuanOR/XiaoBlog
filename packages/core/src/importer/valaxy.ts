import { asStringList, asText, slugFromFile, slugFromTitle, toPinyinSlug } from './common.ts';
import { readPosts } from './hexo.ts';
import type { MigratedPost, MigrationSource } from './types.ts';

/** Valaxy 0.26：pages/posts/*.md，图片在 public/posts/<目录>/。 */
export function scanValaxy(source: MigrationSource): MigratedPost[] {
  return readPosts(source, (fileBase, data, title) => {
    const oldSlug = toPinyinSlug(fileBase) || fileBase;
    const titleSlug = title ? slugFromTitle(title) : '';
    const slug = source.keepDateSlug ? oldSlug : slugFromFile(fileBase) || titleSlug;
    const category = asText(data.categories) || asStringList(data.categories)[0];
    const site = source.siteUrl?.replace(/\/+$/, '');
    return {
      slug,
      category,
      legacyPaths: [],
      oldUrl: site ? `${site}/posts/${oldSlug}` : undefined,
    };
  });
}

export type { MigratedPost };
