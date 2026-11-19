import { createHash } from 'node:crypto';
import { readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

const ignored = ['node_modules', 'dist', '.astro', '.git', '.xiao', '.pnpm-store'];

/** 没见过、而且修改时间早于监视开始：只记基线，不当成刷新。 */
export function watchDecision(input: {
  seen: boolean;
  sameHash: boolean;
  mtimeMs: number;
  startedAt: number;
}): 'ignore' | 'baseline' | 'reload' {
  if (input.seen && input.sameHash) return 'ignore';
  if (!input.seen && input.mtimeMs < input.startedAt) return 'baseline';
  return 'reload';
}

/** 体检报告、构建产物和 Astro 缓存不该触发「文件已按磁盘刷新」。 */
export function watchIgnored(file: string): boolean {
  return file.split(/[\\/]/).some((part) => ignored.includes(part));
}

export interface ReloadEvent {
  file: string;
  content: string;
}

export interface ConflictEvent {
  file: string;
  mine: string;
  disk: string;
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export class SiteWatcher {
  private watcher: FSWatcher | undefined;
  private startedAt = 0;
  private hashes = new Map<string, string>();
  private dirty = new Map<string, string>();
  private timers = new Map<string, NodeJS.Timeout>();
  private readonly root: string;
  private readonly hooks: {
    onReload: (event: ReloadEvent) => void;
    onConflict: (event: ConflictEvent) => void;
  };

  constructor(
    root: string,
    hooks: {
      onReload: (event: ReloadEvent) => void;
      onConflict: (event: ConflictEvent) => void;
    },
  ) {
    this.root = root;
    this.hooks = hooks;
  }

  start(): void {
    this.startedAt = Date.now();
    this.watcher = watch(this.root, { recursive: true }, (_event, name) => {
      if (!name || watchIgnored(name)) return;
      const key = name.replaceAll('/', '\\');
      const pending = this.timers.get(key);
      if (pending) clearTimeout(pending);
      this.timers.set(
        key,
        setTimeout(() => this.handle(key), 80),
      );
    });
  }

  stop(): void {
    this.watcher?.close();
    for (const timer of this.timers.values()) clearTimeout(timer);
  }

  noteWrite(file: string, content: string): void {
    this.hashes.set(this.key(file), digest(content));
    this.dirty.delete(this.key(file));
  }

  markDirty(file: string, content: string): void {
    this.dirty.set(this.key(file), content);
  }

  resolve(file: string, action: 'keep' | 'load'): ReloadEvent | undefined {
    const key = this.key(file);
    const full = path.join(this.root, key);
    let disk = '';
    try {
      disk = readFileSync(full, 'utf8');
    } catch {
      return undefined;
    }
    this.hashes.set(key, digest(disk));
    if (action === 'load') {
      this.dirty.delete(key);
      return { file: key, content: disk };
    }
    return undefined;
  }

  private key(file: string): string {
    const rel = path.isAbsolute(file) ? path.relative(this.root, file) : file;
    return rel.replaceAll('/', '\\');
  }

  private handle(key: string): void {
    const full = path.join(this.root, key);
    let disk = '';
    try {
      disk = readFileSync(full, 'utf8');
    } catch {
      return;
    }
    const next = digest(disk);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(full).mtimeMs;
    } catch {
      return;
    }
    const seen = this.hashes.has(key);
    const decision = watchDecision({
      seen,
      sameHash: seen && this.hashes.get(key) === next,
      mtimeMs,
      startedAt: this.startedAt,
    });
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[watch] ${decision} ${key}`);
    }
    if (decision === 'ignore') return;
    this.hashes.set(key, next);
    if (decision === 'baseline') return;
    const mine = this.dirty.get(key);
    if (mine === undefined) {
      this.hashes.set(key, next);
      this.hooks.onReload({ file: key, content: disk });
      return;
    }
    this.hooks.onConflict({ file: key, mine, disk });
  }
}
