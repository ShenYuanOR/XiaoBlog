import { createHash } from 'node:crypto';
import { readFileSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

const ignored = ['node_modules', 'dist', '.astro', '.git'];

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

function ignoredPath(file: string): boolean {
  return file.split(/[\\/]/).some((part) => ignored.includes(part));
}

export class SiteWatcher {
  private watcher: FSWatcher | undefined;
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
    this.watcher = watch(this.root, { recursive: true }, (_event, name) => {
      if (!name || ignoredPath(name)) return;
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
    if (this.hashes.get(key) === next) return;
    const mine = this.dirty.get(key);
    if (mine === undefined) {
      this.hashes.set(key, next);
      this.hooks.onReload({ file: key, content: disk });
      return;
    }
    this.hooks.onConflict({ file: key, mine, disk });
  }
}
