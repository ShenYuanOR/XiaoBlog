import { extractDescription, slugFromFile, slugFromTitle } from './slug.ts';

export interface MigratedFolderPost {
  slug: string;
  markdown: string;
  redirectFrom?: string;
}

function splitFrontmatter(source: string): { data: Record<string, string>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    data[pair[1]] = pair[2].replace(/^['"]|['"]$/g, '');
  }
  return { data, body: source.slice(match[0].length) };
}

/** 把 1.x 单文件文章收成文件夹，并在旧路径不同时给出重定向。 */
export function migratePost(source: string, oldPath: string): MigratedFolderPost {
  const { data, body } = splitFrontmatter(source);
  const title = data.title || '未命名';
  const fileSlug = oldPath.split('/').pop()?.replace(/\.md$/, '') ?? '';
  const slug = (data.slug && slugFromFile(data.slug)) || slugFromTitle(title) || slugFromFile(fileSlug);
  const description = data.description || extractDescription(body);
  const date = data.date || '1970-01-01 00:00:00';
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${JSON.stringify(date)}`,
    `description: ${JSON.stringify(description)}`,
    '---',
    '',
    body.trim(),
    '',
  ];
  const next = `/posts/${slug}/`;
  const from = oldPath.startsWith('/') ? oldPath : `/${oldPath}`;
  return {
    slug,
    markdown: lines.join('\n'),
    ...(from.replace(/\/+$/, '') === next.replace(/\/+$/, '') ? {} : { redirectFrom: from }),
  };
}
