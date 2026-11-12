import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

let lintQueue: Promise<unknown> = Promise.resolve();

function lintSourceNow(siteDir: string, relative: string): Promise<LintRow[]> {
  const eslint = path.join(siteDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [eslint, '--format', 'json', relative], {
      cwd: siteDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    });
    let stdout = '';
    const timer = setTimeout(() => child.kill(), 20000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    const finish = (rows: LintRow[]) => {
      clearTimeout(timer);
      resolve(rows);
    };
    child.on('error', () => finish([]));
    child.on('close', () => {
      if (!stdout) {
        finish([]);
        return;
      }
      try {
        finish(parseEslint(stdout));
      } catch {
        finish([]);
      }
    });
  });
}

/** 一次只跑一个 ESLint，连续打开文件时排队，不堵住主进程。 */
export function lintSource(siteDir: string, file: string): Promise<LintRow[]> {
  const relative = safeSource(file);
  if (!relative) return Promise.resolve([]);
  const run = lintQueue.then(
    () => lintSourceNow(siteDir, relative),
    () => lintSourceNow(siteDir, relative),
  );
  lintQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
