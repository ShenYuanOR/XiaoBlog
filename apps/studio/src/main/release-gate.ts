export interface ChangeGroups {
  posts: string[];
  pages: string[];
  settings: string[];
}

export function groupChanges(lines: string[]): ChangeGroups {
  const groups: ChangeGroups = { posts: [], pages: [], settings: [] };
  for (const line of lines) {
    const file = line.slice(3).trim().replaceAll('\\', '/');
    if (!file) continue;
    if (file.includes('src/content/posts/')) groups.posts.push(file);
    else if (file.includes('src/pages/')) groups.pages.push(file);
    else if (file.endsWith('xiao.config.json') || file.includes('src/styles/'))
      groups.settings.push(file);
  }
  return groups;
}

export function blockedBy(rows: { level: string }[]): boolean {
  return rows.some((row) => row.level === 'error');
}

export interface DeployRecord {
  at: string;
  repo: string;
}

export function rememberDeploy(history: DeployRecord[], item: DeployRecord): DeployRecord[] {
  return [...history, item].slice(-20);
}

export function renewalDue(expires: string, now: Date): boolean {
  if (!expires) return false;
  const end = new Date(expires).getTime();
  if (Number.isNaN(end)) return false;
  const left = end - now.getTime();
  return left > 0 && left < 7 * 24 * 60 * 60 * 1000;
}
