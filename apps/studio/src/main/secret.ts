import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Cipher {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

interface SecretRow {
  secret: string;
  expires: string;
}

interface VolatileRow {
  token: string;
  expires: string;
}

export function redactSecrets(text: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (line, secret) => (secret ? line.split(secret).join('[secret]') : line),
    text,
  );
}

/**
 * Token 加密存本机。某些机器上用户目录不可写（权限 / 火绒等 HIPS 拦截），
 * 这时降级成「只在本次运行有效」，并把 persisted 标记出来让界面提示用户。
 */
export class SecretService {
  private readonly memory = new Map<string, VolatileRow>();
  private readonly volatileOnly = new Set<string>();

  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {}

  save(repo: string, token: string, expires: string): void {
    this.memory.set(repo, { token, expires });
    try {
      const rows = this.readAll();
      rows[repo] = { secret: this.cipher.encrypt(token), expires };
      this.writeAll(rows);
      this.volatileOnly.delete(repo);
    } catch (error) {
      this.volatileOnly.add(repo);
      console.warn(
        `Token 无法写入本机用户目录，只在本次运行有效：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  load(repo: string): string | null {
    if (this.volatileOnly.has(repo)) return this.memory.get(repo)?.token ?? null;
    try {
      const row = this.readAll()[repo];
      if (!row) return this.memory.get(repo)?.token ?? null;
      return this.cipher.decrypt(row.secret);
    } catch {
      return this.memory.get(repo)?.token ?? null;
    }
  }

  /** 是否真的写进了磁盘（false = 只在本次运行有效）。 */
  persisted(repo: string): boolean {
    return !this.volatileOnly.has(repo);
  }

  remove(repo: string): void {
    this.memory.delete(repo);
    this.volatileOnly.delete(repo);
    try {
      const rows = this.readAll();
      delete rows[repo];
      this.writeAll(rows);
    } catch (error) {
      console.warn(
        `删除本机保存的 Token 失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  list(): { repo: string; expires: string }[] {
    const merged = new Map<string, string>();
    for (const [repo, row] of Object.entries(this.readAll())) merged.set(repo, row.expires);
    for (const [repo, row] of this.memory) {
      if (this.volatileOnly.has(repo)) merged.set(repo, row.expires);
    }
    return [...merged.entries()].map(([repo, expires]) => ({ repo, expires }));
  }

  private readAll(): Record<string, SecretRow> {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, SecretRow>;
    } catch {
      return {};
    }
  }

  private writeAll(rows: Record<string, SecretRow>): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(rows)}\n`);
  }
}
