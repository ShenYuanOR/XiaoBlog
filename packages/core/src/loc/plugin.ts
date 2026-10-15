import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { injectLoc } from './inject';

interface ResolvedPlugin {
  name: string;
}

interface ResolvedConfig {
  root: string;
  plugins: readonly ResolvedPlugin[];
}

export interface XiaoLocPlugin {
  name: 'xiao-loc';
  apply: 'serve';
  enforce: 'pre';
  configResolved(config: ResolvedConfig): void;
  load(id: string): string | null;
}

let projectRoot = process.cwd();

function isAstroModule(id: string): boolean {
  const clean = id.split('?')[0] ?? id;
  if (!clean.endsWith('.astro') || id.includes('?')) return false;
  return !clean.replaceAll('\\', '/').includes('/node_modules/');
}

function toRelative(file: string): string {
  return path.relative(projectRoot, file).split(path.sep).join('/');
}

export function xiaoLocPlugin(): XiaoLocPlugin {
  return {
    name: 'xiao-loc',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      projectRoot = config.root;
      const names = config.plugins.map((plugin) => plugin.name);
      const mine = names.indexOf('xiao-loc');
      const astro = names.indexOf('astro:build');
      const report = {
        strategy: 'load',
        transformBeforeAstro: mine !== -1 && astro !== -1 && mine < astro,
        mine,
        astro,
      };
      writeFileSync(path.join(config.root, '.xiao-loc-order.json'), JSON.stringify(report));
    },
    load(id) {
      if (!isAstroModule(id)) return null;
      const clean = id.split('?')[0] ?? id;
      let source: string;
      try {
        source = readFileSync(clean, 'utf8');
      } catch {
        return null;
      }
      const next = injectLoc(source, toRelative(clean));
      return next === source ? null : next;
    },
  };
}
