import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_VERSION,
  parseGiteaRemote,
  probeGiteaActions,
  writeDeployWorkflow,
} from '../../../../apps/studio/src/main/publish-workflow.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Gitea 构建配置', () => {
  it('解析仓库地址', () => {
    expect(parseGiteaRemote('http://192.168.1.170:3000/owner/site.git')).toEqual({
      origin: 'http://192.168.1.170:3000',
      owner: 'owner',
      repo: 'site',
    });
  });

  it('同版本的构建配置不覆盖', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xiao-workflow-'));
    try {
      expect(writeDeployWorkflow(dir, 'master')).toBe('written');
      const file = join(dir, '.gitea', 'workflows', 'xiao-deploy.yml');
      const text = readFileSync(file, 'utf8');
      expect(text).toContain(`版本：${WORKFLOW_VERSION}`);
      expect(text).toContain('XIAO_BUILD_SHA:');
      expect(text).toContain('HEAD:pages');
      expect(writeDeployWorkflow(dir, 'main')).toBe('kept');
      expect(readFileSync(file, 'utf8')).toContain('branches: ["master"]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('没有在线构建机时说明缺什么', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/actions/runners')) return jsonResponse({ runners: [{ status: 'offline' }] });
      return jsonResponse({ has_actions: true });
    }) as typeof fetch;
    const result = await probeGiteaActions('http://gitea.local/owner/site.git', 'token', fetchImpl);
    expect(result.state).toBe('no-runner');
    expect(result.detail).toContain('没有在线的构建机');

    const disabled = await probeGiteaActions(
      'http://gitea.local/owner/site.git',
      'token',
      (async () => jsonResponse({ has_actions: false })) as typeof fetch,
    );
    expect(disabled.state).toBe('disabled');
    expect(disabled.detail).toContain('没有开启 Actions');
  });
});
