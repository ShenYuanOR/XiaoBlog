export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface FileChange {
  path: string;
  status: ChangeStatus;
  from?: string;
}

export interface PostChange {
  slug: string;
  title: string;
  status: ChangeStatus;
  files: FileChange[];
}

export interface ChangeSummary {
  posts: PostChange[];
  pages: FileChange[];
  settings: FileChange[];
  settingsStatus: ChangeStatus | null;
  other: FileChange[];
}

const SETTINGS_FILES = new Set([
  'xiao.config.json',
  'xiao.config.schema.json',
  'src/theme.json',
  'astro.config.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
]);

const SETTINGS_PREFIXES = ['src/styles/', 'src/layouts/', 'src/components/', 'src/lib/'];

export function emptyChanges(): ChangeSummary {
  return { posts: [], pages: [], settings: [], settingsStatus: null, other: [] };
}

function unquoteGitPath(value: string): string {
  const text = value.trim().replaceAll('\\', '/');
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return String(JSON.parse(text)).replaceAll('\\', '/');
    } catch {
      return text.slice(1, -1).replaceAll('\\', '/');
    }
  }
  return text;
}

function statusOf(xy: string): ChangeStatus {
  if (xy === '??' || (xy[0] === 'A' && xy[1] !== 'D')) return 'added';
  if (xy.includes('D')) return 'deleted';
  if (xy.includes('R')) return 'renamed';
  if (xy.includes('C')) return 'added';
  return 'modified';
}

/** 解析 `git status --porcelain` 的一行。重命名保留原路径。 */
export function parseStatusLine(line: string): FileChange | null {
  if (line.length < 4 || line[2] !== ' ') return null;
  const xy = line.slice(0, 2);
  const rest = line.slice(3);
  const renamed = xy.includes('R') || xy.includes('C');
  const arrow = rest.indexOf(' -> ');
  const from = renamed && arrow >= 0 ? unquoteGitPath(rest.slice(0, arrow)) : undefined;
  const path = unquoteGitPath(renamed && arrow >= 0 ? rest.slice(arrow + 4) : rest);
  if (!path || path.endsWith('/')) return null;
  const file: FileChange = { path, status: statusOf(xy) };
  if (from) file.from = from;
  return file;
}

export function parseStatus(text: string): FileChange[] {
  const files: FileChange[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const file = parseStatusLine(raw.trimEnd());
    if (file) files.push(file);
  }
  return files;
}

function skipped(path: string): boolean {
  return (
    path === '.pnpm-store' ||
    path.startsWith('.pnpm-store/') ||
    path.startsWith('node_modules/') ||
    path.split('/').includes('.pnpm-store')
  );
}

function isSettings(path: string): boolean {
  return SETTINGS_FILES.has(path) || SETTINGS_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function rollupStatus(statuses: ChangeStatus[]): ChangeStatus {
  const unique = new Set(statuses);
  if (unique.size === 0) return 'modified';
  if (unique.size === 1) return [...unique][0] ?? 'modified';
  if ([...unique].every((item) => item === 'deleted')) return 'deleted';
  if ([...unique].every((item) => item === 'added')) return 'added';
  return 'modified';
}

/** 文章按目录归成一篇；设置、主题、样式和模板归成一组。标题由调用方读 frontmatter。 */
export function summarizeChanges(files: FileChange[], titleOf: (slug: string) => string): ChangeSummary {
  const summary = emptyChanges();
  const posts = new Map<string, FileChange[]>();
  for (const file of files) {
    if (skipped(file.path)) continue;
    const post = /^src\/content\/posts\/([^/]+)\/(.+)$/.exec(file.path);
    if (post?.[1] && post[2]) {
      const list = posts.get(post[1]) ?? [];
      list.push(file);
      posts.set(post[1], list);
      continue;
    }
    if (file.path.startsWith('src/pages/')) summary.pages.push(file);
    else if (isSettings(file.path)) summary.settings.push(file);
    else summary.other.push(file);
  }
  summary.posts = [...posts.entries()]
    .map(([slug, list]) => ({
      slug,
      title: titleOf(slug) || slug,
      status: rollupStatus(list.map((file) => file.status)),
      files: list,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  summary.settingsStatus = summary.settings.length
    ? rollupStatus(summary.settings.map((file) => file.status))
    : null;
  return summary;
}

export function blockedBy(rows: { level: string }[]): boolean {
  return rows.some((row) => row.level === 'error');
}

export interface DeployStepNote {
  key: 'check' | 'push' | 'build' | 'live';
  label: string;
  state: 'ok' | 'fail' | 'wait' | 'run';
  ms: number;
}

export interface DeployRecord {
  at: string;
  repo: string;
  sha?: string;
  result?: string;
  ms?: number;
  steps?: DeployStepNote[];
}

export function rememberDeploy(history: DeployRecord[], item: DeployRecord): DeployRecord[] {
  return [...history, item].slice(-20);
}

/** 本次运行里写过的历史优先于磁盘。磁盘读失败或还没写过时，用另一边。 */
export function historyRows(memory: DeployRecord[] | undefined, disk: DeployRecord[] | undefined): DeployRecord[] {
  return memory ?? disk ?? [];
}

/** 历史表结果列只写结论。四步明细用 historyStepDetail。 */
export function historyConclusion(record: { result?: string; steps?: { key?: string; label: string; state: string }[] }): string {
  const failed = record.steps?.find((step) => step.state === 'fail');
  if (failed) return `停在${failed.label}`;
  if (record.steps?.length && record.steps.every((step) => step.state === 'ok')) return '已上线';
  return record.result || '已记录';
}

export function historyStepDetail(steps: { label: string; state: string }[] | undefined): string {
  if (!steps?.length) return '';
  const name = (state: string): string => (state === 'ok' ? '完成' : state === 'fail' ? '失败' : '未进行');
  return steps.map((step) => `${step.label}${name(step.state)}`).join('、');
}

export function renewalDue(expires: string, now: Date): boolean {
  if (!expires) return false;
  const end = new Date(expires).getTime();
  if (Number.isNaN(end)) return false;
  const left = end - now.getTime();
  return left > 0 && left < 7 * 24 * 60 * 60 * 1000;
}
