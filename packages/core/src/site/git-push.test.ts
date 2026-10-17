import { describe, expect, it } from 'vitest';
import {
  checkPush,
  createHttpClient,
  gitAuth,
  publishRepo,
  type GitOps,
} from '../../../../apps/studio/src/main/git.ts';

const token = 'local-fake-token';

function ops(): { git: GitOps; steps: string[]; forces: boolean[] } {
  const steps: string[] = [];
  const forces: boolean[] = [];
  const git: GitOps = {
    commit: async () => {
      steps.push('commit');
    },
    push: async (_ref, force) => {
      forces.push(force);
      steps.push(force ? 'push-force' : 'push');
    },
    fetch: async () => {
      steps.push('fetch');
    },
    pointAtRemote: async () => {
      steps.push('point');
    },
    takeRemoteOnly: async () => {
      steps.push('take');
    },
  };
  return { git, steps, forces };
}

const ready = {
  files: [{ path: 'src/a.md', bytes: 10 }],
  gitignore: 'node_modules/\ndist/\n.astro/\n',
  tracked: ['pnpm-lock.yaml'],
  authorName: '晓',
  authorEmail: '',
  login: 'owner',
  branch: 'master',
  when: new Date(2026, 9, 17, 16, 30),
  commonHistory: true,
  force: false,
};

describe('推送', () => {
  it('假 HttpClient 不离开测试，鉴权按规范', async () => {
    const seen: string[] = [];
    const client = createHttpClient(async (url, init) => {
      seen.push(`${init.method} ${url}`);
      return { status: 200, statusText: 'OK', url, body: new Uint8Array([1]) };
    });
    const response = await client.request({
      url: 'https://example.test/git/info/refs',
      method: 'GET',
      headers: {},
    });
    const chunks = [];
    for await (const chunk of response.body) chunks.push(chunk);
    expect(seen).toEqual(['GET https://example.test/git/info/refs']);
    expect(chunks).toEqual([new Uint8Array([1])]);
    const auth = gitAuth(token);
    expect(auth.onAuth().username).toBe('x-access-token');
    expect(auth.onAuthFailure()).toEqual({ cancel: true });
    expect(JSON.stringify(seen)).not.toContain(token);
  });

  it('空仓库只提交再推送，不用 force', async () => {
    const recorded = ops();
    const result = await publishRepo({ ...ready, remoteEmpty: true, git: recorded.git });
    expect(recorded.steps).toEqual(['commit', 'push']);
    expect(recorded.forces).toEqual([false]);
    expect(result.message).toBe('发布：2026-10-17 16:30');
  });

  it('远端非空且没有共同历史时先取回再快进', async () => {
    const recorded = ops();
    await publishRepo({
      ...ready,
      remoteEmpty: false,
      commonHistory: false,
      git: recorded.git,
    });
    expect(recorded.steps).toEqual(['fetch', 'point', 'take', 'commit', 'push']);
    expect(recorded.forces).toEqual([false]);
  });

  it('只有确认覆盖时才 force', async () => {
    const recorded = ops();
    await publishRepo({ ...ready, remoteEmpty: false, force: true, git: recorded.git });
    expect(recorded.steps).toEqual(['commit', 'push-force']);
  });

  it('过大、忽略规则和锁文件会拦住', () => {
    const check = checkPush({
      files: [
        { path: 'big.bin', bytes: 60 * 1024 * 1024 },
        { path: 'huge.bin', bytes: 100 * 1024 * 1024 + 1 },
      ],
      gitignore: 'node_modules/\n',
      tracked: ['README.md'],
    });
    expect(check.warnings).toEqual(['big.bin 超过 50 MB']);
    expect(check.errors).toEqual([
      'huge.bin 超过 100 MB',
      '.gitignore 缺少 dist/',
      '.gitignore 缺少 .astro/',
      '提交里没有 pnpm-lock.yaml',
    ]);
  });

  it('缺邮箱时用 noreply 地址', async () => {
    let email = '';
    await publishRepo({
      ...ready,
      remoteEmpty: true,
      git: {
        ...ops().git,
        commit: async (_message, author) => {
          email = author.email;
        },
      },
    });
    expect(email).toBe('owner@users.noreply.github.com');
  });
});
