import { getCollection, type CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

export async function publishedPosts(): Promise<PostEntry[]> {
  const posts = await getCollection('posts', (post) => post.data.draft !== true);
  return posts.sort((a, b) => (a.data.date < b.data.date ? 1 : -1));
}

export function neighbors(
  posts: PostEntry[],
  slug: string,
): { prev?: PostEntry; next?: PostEntry } {
  const index = posts.findIndex((post) => post.id === slug);
  return {
    prev: index > 0 ? posts[index - 1] : undefined,
    next: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}

export function categoriesOf(posts: PostEntry[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    if (!post.data.category) continue;
    counts.set(post.data.category, (counts.get(post.data.category) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

export function readingMinutes(text: string): number {
  const count = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(count / 400));
}

export function tagsOf(posts: PostEntry[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}
