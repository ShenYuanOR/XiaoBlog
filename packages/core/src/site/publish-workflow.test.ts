import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_VERSION,
  parseGiteaRemote,
  probeGiteaActions,
  workflowYaml,
  writeDeployWorkflow,
} from '../../../../apps/studio/src/main/publish-workflow.ts';

type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml };

/** 只覆盖本工作流用到的 YAML：缩进映射、序列、引号和 `|` 块。非法标量会抛错。 */
function parseYaml(source: string): Yaml {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let index = 0;
  const readBlock = (indent: number): Yaml => {
    const node: { [key: string]: Yaml } = {};
    const list: Yaml[] = [];
    let mode: 'map' | 'list' | '' = '';
    while (index < lines.length) {
      const raw = lines[index] ?? '';
      if (!raw.trim() || raw.trimStart().startsWith('#')) {
        index += 1;
        continue;
      }
      const current = raw.match(/^ */)?.[0].length ?? 0;
      if (current < indent) break;
      if (current > indent) throw new Error(`缩进不对：${raw}`);
      if (raw.trimStart().startsWith('- ')) {
        if (mode === 'map') throw new Error(`映射里混进了列表：${raw}`);
        mode = 'list';
        const rest = raw.trimStart().slice(2);
        index += 1;
        if (rest.includes(': ')) {
          const key = rest.slice(0, rest.indexOf(':'));
          const value = rest.slice(rest.indexOf(':') + 1).trim();
          const item: { [key: string]: Yaml } = { [key]: parseScalar(value, indent + 2) };
          if (value === '|' || value === '') {
            // 同行已经取了值。下面更深的键并进这一项。
          }
          while (index < lines.length) {
            const next = lines[index] ?? '';
            if (!next.trim()) {
              index += 1;
              continue;
            }
            const nextIndent = next.match(/^ */)?.[0].length ?? 0;
            if (nextIndent <= indent) break;
            if (nextIndent === indent + 2 && !next.trimStart().startsWith('- ')) {
              const nested = String(next.trim());
              const colon = nested.indexOf(':');
              index += 1;
              const nestedKey = nested.slice(0, colon);
              const nestedValue = nested.slice(colon + 1).trim();
              item[nestedKey] = parseScalar(nestedValue, indent + 4);
            } else break;
          }
          list.push(item);
        } else {
          list.push(parseScalar(rest, indent + 2));
        }
        continue;
      }
      if (mode === 'list') throw new Error(`列表里混进了映射：${raw}`);
      mode = 'map';
      const body = raw.trim();
      const colon = body.indexOf(':');
      if (colon <= 0) throw new Error(`不是键值：${raw}`);
      const key = body.slice(0, colon).trim();
      const value = body.slice(colon + 1).trim();
      index += 1;
      node[key] = parseScalar(value, indent + 2);
    }
    return mode === 'list' ? list : node;
  };
  const parseScalar = (value: string, indent: number): Yaml => {
    if (value === '|' || value === '|-') {
      const block: string[] = [];
      while (index < lines.length) {
        const raw = lines[index] ?? '';
        if (!raw.trim()) {
          block.push('');
          index += 1;
          continue;
        }
        const current = raw.match(/^ */)?.[0].length ?? 0;
        if (current < indent) break;
        block.push(raw.slice(indent));
        index += 1;
      }
      return block.join('\n').replace(/\n+$/, '\n');
    }
    if (value === '') return readBlock(indent);
    if (/: /.test(value) && !(value.startsWith('"') || value.startsWith("'") || value.startsWith('${{'))) {
      throw new Error(`普通标量里有冒号，必须改成块：${value}`);
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^-?\d+$/.test(value)) return Number(value);
    return value;
  };
  return readBlock(0);
}

function walkUses(node: Yaml): string[] {
  if (Array.isArray(node)) return node.flatMap((item) => walkUses(item));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) => (key === 'uses' ? [String(value)] : walkUses(value)));
  }
  return [];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Gitea 构建配置', () => {
  it('生成的工作流能被解析，并且跑在 xiao 上', () => {
    const parsed = parseYaml(workflowYaml('main')) as { jobs: { deploy: { 'runs-on': string; steps: { run?: string; uses?: string }[] } } };
    expect(parsed.jobs.deploy['runs-on']).toBe('xiao');
    expect(walkUses(parsed)).toEqual([]);
    const build = parsed.jobs.deploy.steps.find((step) => step.run?.trim() === 'pnpm build');
    expect(build?.run).toBe('pnpm build');
    expect(JSON.stringify(parsed)).not.toContain('ubuntu-latest');
    expect(JSON.stringify(parsed)).not.toContain('astro build');
  });

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
