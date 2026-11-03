/**
 * 文章图片在 Studio 里的可见地址。
 *
 * 正文里存的是站点能用的原始路径（`./name.png`、`/media/...`、外链），
 * 编辑器渲染时换成 `xiao-asset://`，保存时仍然写原始路径。
 */

export function imageDisplaySrc(src: string, siteDir: string, slug: string): string {
  if (!src) return '';
  if (src.startsWith('xiao-asset:') || src.startsWith('data:')) return src;
  if (src.startsWith('./')) {
    const name = encodeURIComponent(src.slice(2));
    const site = encodeURIComponent(siteDir);
    return `xiao-asset://local/${name}?site=${site}&slug=${encodeURIComponent(slug)}`;
  }
  if (src.startsWith('/') && !src.startsWith('//')) {
    const rel = `public${src}`;
    const site = encodeURIComponent(siteDir);
    return `xiao-asset://media/?site=${site}&path=${encodeURIComponent(rel)}`;
  }
  return src;
}

/** 媒体库里的站点相对路径 → 正文里该写的引用。 */
export function mediaSourcePath(path: string, slug: string): string {
  const normalized = path.replaceAll('\\', '/');
  const postPrefix = `src/content/posts/${slug}/`;
  if (normalized.startsWith(postPrefix)) return `./${normalized.slice(postPrefix.length)}`;
  if (normalized.startsWith('public/')) return `/${normalized.slice('public/'.length)}`;
  return `/${normalized}`;
}
