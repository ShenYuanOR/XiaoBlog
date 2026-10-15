import rss from '@astrojs/rss';
import { publishedPosts } from '../lib/posts';
import { loadConfig } from '../lib/config';
import { withBase } from '../lib/base';

export async function GET(context: { site?: URL }) {
  const config = loadConfig();
  const posts = await publishedPosts();
  return rss({
    title: config.site.title,
    description: config.site.description,
    site: new URL(withBase(), context.site).href,
    items: posts
      .filter((post) => post.data.noindex !== true)
      .map((post) => ({
        title: post.data.title,
        description: post.data.description ?? post.data.title,
        pubDate: new Date(post.data.date.replace(' ', 'T')),
        link: new URL(withBase(`posts/${post.id}/`), context.site).href,
      })),
  });
}
