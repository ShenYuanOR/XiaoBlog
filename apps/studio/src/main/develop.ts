import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const skip = new Set(['node_modules', 'dist', '.astro', '.git', '.xiao-recycle']);

export const SOURCE_SYNC_MS = 300;

export function listSourceFiles(siteDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      found.push(path.relative(siteDir, full).split(path.sep).join('/'));
    }
  };
  walk(siteDir);
  return found.sort();
}

export function safeSource(file?: string): string | null {
  if (!file || file.includes('..') || path.isAbsolute(file)) return null;
  return file.split('\\').join('/');
}

export function readSource(siteDir: string, file: string): string {
  const relative = safeSource(file);
  if (!relative) throw new Error('路径不安全');
  return readFileSync(path.join(siteDir, relative), 'utf8');
}

export function writeSource(siteDir: string, file: string, content: string): string {
  const relative = safeSource(file);
  if (!relative) throw new Error('路径不安全');
  const full = path.join(siteDir, relative);
  writeFileSync(full, content);
  return full;
}

export interface LintRow {
  line: number;
  message: string;
}

export function parseEslint(stdout: string): LintRow[] {
  const start = stdout.indexOf('[');
  if (start < 0) return [];
  const rows = JSON.parse(stdout.slice(start)) as {
    messages?: { line?: number; message?: string }[];
  }[];
  return rows.flatMap((row) =>
    (row.messages ?? []).map((item) => ({
      line: item.line ?? 0,
      message: item.message ?? '',
    })),
  );
}

export function lintSource(siteDir: string, file: string): LintRow[] {
  const relative = safeSource(file);
  if (!relative) return [];
  const eslint = path.join(siteDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const result = spawnSync(process.execPath, [eslint, '--format', 'json', relative], {
    cwd: siteDir,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    timeout: 20000,
  });
  if (!result.stdout) return [];
  try {
    return parseEslint(result.stdout);
  } catch {
    return [];
  }
}
