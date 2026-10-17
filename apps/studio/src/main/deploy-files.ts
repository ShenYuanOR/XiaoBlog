import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deployWorkflow, siteBase } from './wizard.ts';

export function writeDeployFiles(
  siteDir: string,
  input: { owner: string; repo: string; branch: string; url: string },
): void {
  const configPath = path.join(siteDir, 'xiao.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    site?: { url?: string; base?: string };
    deploy?: { repo?: string; branch?: string };
  };
  config.site = { ...(config.site ?? {}), url: input.url, base: siteBase(input.owner, input.repo) };
  config.deploy = { repo: `${input.owner}/${input.repo}`, branch: input.branch };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const workflow = path.join(siteDir, '.github', 'workflows');
  mkdirSync(workflow, { recursive: true });
  writeFileSync(path.join(workflow, 'deploy.yml'), deployWorkflow(input.branch));
}
