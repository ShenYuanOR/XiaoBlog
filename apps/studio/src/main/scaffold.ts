import fs from 'node:fs';
import path from 'node:path';
import git from 'isomorphic-git';
import { slugFromTitle } from '@xiao/core/site';

const skip = new Set(['node_modules', 'dist', '.astro', 'release', 'release2', '.shim']);

export function siteFolderName(title: string): string {
  return slugFromTitle(title);
}

export function copyTemplate(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(from, source);
      if (!rel) return true;
      return !skip.has(rel.split(path.sep)[0] ?? rel);
    },
  });
}

export function writeSiteBasics(siteDir: string, title: string, author: string): void {
  const configPath = path.join(siteDir, 'xiao.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    site?: { title?: string; description?: string };
    author?: { name?: string };
  };
  config.site = { ...config.site, title, description: config.site?.description ?? title };
  config.author = { ...config.author, name: author };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const pkgPath = path.join(siteDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
  pkg.name = siteFolderName(title);
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function listFiles(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) found.push(...listFiles(full, root));
    else found.push(path.relative(root, full).replaceAll('\\', '/'));
  }
  return found;
}

export function placeLockfile(siteDir: string, lockfile: string): void {
  fs.copyFileSync(lockfile, path.join(siteDir, 'pnpm-lock.yaml'));
}

export async function initRepository(siteDir: string, author: string): Promise<void> {
  await git.init({ fs, dir: siteDir, defaultBranch: 'master' });
  for (const filepath of listFiles(siteDir)) {
    await git.add({ fs, dir: siteDir, filepath });
  }
  await git.commit({
    fs,
    dir: siteDir,
    message: '初始化站点',
    author: { name: author || '晓', email: 'studio@localhost' },
  });
}
