import { pinyin } from 'pinyin-pro';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function toPinyinSlug(text: string): string {
  return text
    .split(/([\u4e00-\u9fa5]+)/)
    .map((segment) => {
      if (/^[\u4e00-\u9fa5]+$/.test(segment)) {
        return pinyin(segment, { toneType: 'none', type: 'array' })
          .map((item) => item.replace(/[^a-zA-Z0-9]/g, ''))
          .filter(Boolean)
          .join('-');
      }
      return segment.replace(/[^a-zA-Z0-9]+/g, '-');
    })
    .filter(Boolean)
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function slugFromTitle(title: string): string {
  const normalized = title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!normalized) return 'post';
  if (SLUG_RE.test(normalized)) return normalized;
  return toPinyinSlug(normalized) || 'post';
}

export function slugFromFile(fileBase: string): string {
  const withoutDate = fileBase.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  if (SLUG_RE.test(withoutDate)) return withoutDate;
  return toPinyinSlug(withoutDate) || withoutDate.toLowerCase();
}

export function extractDescription(content: string, max = 120): string {
  const text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, max);
}
