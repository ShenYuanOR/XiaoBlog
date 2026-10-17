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

export function redactSecrets(text: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (line, secret) => (secret ? line.split(secret).join('[secret]') : line),
    text,
  );
}

export class SecretService {
  constructor(
    private readonly file: string,
    private readonly cipher: Cipher,
  ) {}

  save(repo: string, token: string, expires: string): void {
    const rows = this.readAll();
    rows[repo] = { secret: this.cipher.encrypt(token), expires };
    this.writeAll(rows);
  }

  load(repo: string): string | null {
    const row = this.readAll()[repo];
    if (!row) return null;
    return this.cipher.decrypt(row.secret);
  }

  remove(repo: string): void {
    const rows = this.readAll();
    delete rows[repo];
    this.writeAll(rows);
  }

  list(): { repo: string; expires: string }[] {
    return Object.entries(this.readAll()).map(([repo, row]) => ({ repo, expires: row.expires }));
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
