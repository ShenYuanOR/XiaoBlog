import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('posts');
  const rawBase = import.meta.env.BASE_URL;
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return rss({
    title: 'XiaoSpike',
    description: 'T-0.11 子路径检查',
    site: new URL(base, context.site).href,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: new Date('2026-10-16T00:00:00Z'),
      description: post.data.title,
      link: new URL(`${base}note/`, context.site).href,
    })),
  });
}
