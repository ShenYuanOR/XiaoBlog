import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deployWorkflow } from './wizard.ts';

export const GITHUB_WORKFLOW_PATH = '.github/workflows/xiao-deploy.yml';

export interface GitRemote {
  origin: string;
  owner: string;
  repo: string;
}

export function parseGitRemote(remoteUrl: string): GitRemote | null {
  try {
    const url = new URL(remoteUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const repo = (parts[parts.length - 1] ?? '').replace(/\.git$/, '');
    const owner = parts[parts.length - 2] ?? '';
    if (!owner || !repo) return null;
    return { origin: url.origin, owner, repo };
  } catch {
    return null;
  }
}

/** GitHub Pages 构建配置。内容相同就保留。 */
export function writeGithubWorkflow(siteDir: string, branch: string): 'written' | 'kept' {
  const full = join(siteDir, GITHUB_WORKFLOW_PATH);
  const next = deployWorkflow(branch);
  if (existsSync(full) && readFileSync(full, 'utf8') === next) return 'kept';
  mkdirSync(join(siteDir, '.github', 'workflows'), { recursive: true });
  writeFileSync(full, next);
  return 'written';
}
