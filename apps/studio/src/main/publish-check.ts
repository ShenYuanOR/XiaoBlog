import { parseStatus } from './release-gate.ts';

const IGNORED = new Set(['.pnpm-store', 'node_modules', 'dist', '.astro', '.git']);

function ignored(path: string): boolean {
  return path.split(/[\\/]/).some((part) => IGNORED.has(part));
}

export interface CheckCacheEntry<T> {
  fingerprint: string;
  at: number;
  value: T;
}

/** HEAD、工作区改动的路径/大小/修改时间，再加配置文件的修改时间。 */
export function checkFingerprint(input: {
  head: string;
  porcelain: string;
  stat: (rel: string) => { size: number; mtimeMs: number } | null;
}): string {
  const paths = parseStatus(input.porcelain)
    .map((file) => file.path)
    .filter((path) => !ignored(path))
    .sort();
  const lines = [`HEAD ${input.head}`];
  for (const path of paths) {
    const info = input.stat(path);
    lines.push(`${path} ${info?.size ?? -1} ${Math.round(info?.mtimeMs ?? -1)}`);
  }
  for (const extra of ['xiao.config.json', 'src/theme.json']) {
    const info = input.stat(extra);
    lines.push(`#${extra} ${Math.round(info?.mtimeMs ?? -1)}`);
  }
  return lines.join('\n');
}

export function cachedCheck<T>(entry: CheckCacheEntry<T> | undefined, fingerprint: string): CheckCacheEntry<T> | null {
  if (!entry || entry.fingerprint !== fingerprint) return null;
  return entry;
}

/** 提交后 HEAD 变了，但检查过的内容就是这次提交。把同一份结果记到新指纹上。 */
export function retargetCache<T>(entry: CheckCacheEntry<T>, fingerprint: string): CheckCacheEntry<T> {
  return { ...entry, fingerprint };
}
