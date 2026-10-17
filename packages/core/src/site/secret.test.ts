import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GitHubService } from '../../../../apps/studio/src/main/github.ts';
import { redactSecrets, SecretService } from '../../../../apps/studio/src/main/secret.ts';

const token = 'local-fake-token';

const cipher = {
  encrypt(plain: string): string {
    return Buffer.from(plain, 'utf8').toString('base64');
  },
  decrypt(stored: string): string {
    return Buffer.from(stored, 'base64').toString('utf8');
  },
};

describe('Token 存储', () => {
  it('磁盘和日志里都没有明文', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'xiao-secret-'));
    const file = path.join(dir, 'secrets.json');
    const secrets = new SecretService(file, cipher);
    secrets.save('owner/blog', token, '2026-12-01');
    const disk = readFileSync(file, 'utf8');
    expect(disk).not.toContain(token);
    expect(secrets.load('owner/blog')).toBe(token);
    expect(secrets.list()).toEqual([{ repo: 'owner/blog', expires: '2026-12-01' }]);
    const calls: string[] = [];
    const github = new GitHubService(async (url, init) => {
      calls.push(redactSecrets(`${url} ${init.headers.Authorization ?? ''}`, [token]));
      return { status: 200, body: '{}' };
    });
    const response = await github.repo('owner', 'blog', secrets.load('owner/blog') ?? '');
    expect(response.status).toBe(200);
    expect(calls).toEqual(['https://api.github.com/repos/owner/blog Bearer [secret]']);
    expect(calls.join('\n')).not.toContain(token);
  });
});
