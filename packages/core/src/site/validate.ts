import { isValidSlug } from './slug.ts';
import { normalizeRoute } from './url.ts';

export interface ValidationIssue {
  level: 'error' | 'warn';
  rule: string;
  message: string;
}

export interface PostRecord {
  slug: string;
  title: string;
  description?: string;
  content: string;
}

export function validatePosts(posts: PostRecord[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();
  for (const post of posts) {
    if (!isValidSlug(post.slug)) {
      issues.push({ level: 'error', rule: 'slug', message: `slug 不合法：${post.slug}` });
    }
    seen.set(post.slug, (seen.get(post.slug) ?? 0) + 1);
    if (!post.title.trim()) {
      issues.push({ level: 'error', rule: 'title', message: `缺 title：${post.slug}` });
    } else if ([...post.title].length > 60) {
      issues.push({ level: 'warn', rule: 'title-length', message: `title 超过 60：${post.slug}` });
    }
    if (!post.description) {
      issues.push({ level: 'warn', rule: 'description', message: `缺 description：${post.slug}` });
    } else if ([...post.description].length > 160) {
      issues.push({
        level: 'warn',
        rule: 'description-length',
        message: `description 超过 160：${post.slug}`,
      });
    }
  }
  for (const [slug, count] of seen) {
    if (count > 1) issues.push({ level: 'error', rule: 'slug', message: `slug 重复：${slug}` });
  }
  return issues;
}

export function findDeadLinks(html: string, known: Set<string>): string[] {
  const dead: string[] = [];
  const re = /href="([^"]+)"/g;
  for (const match of html.matchAll(re)) {
    const href = match[1] ?? '';
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const path = normalizeRoute(href.split('#')[0]?.split('?')[0] ?? href);
    if (!known.has(path)) dead.push(href);
  }
  return dead;
}
