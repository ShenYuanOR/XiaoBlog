import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { xiaoLocPlugin } from './xiao-loc.mjs';

const siteDir = process.env.XIAO_SITE_DIR ?? process.cwd();
const userMod = await import(pathToFileURL(path.join(siteDir, 'astro.config.mjs')).href);
const user = userMod.default ?? {};
const plugin = xiaoLocPlugin(siteDir);

function append(vite) {
  return { ...(vite ?? {}), plugins: [...(vite?.plugins ?? []), plugin] };
}

const config =
  typeof user.vite === 'function'
    ? {
        ...user,
        vite(options) {
          return append(user.vite(options));
        },
      }
    : { ...user, vite: append(user.vite) };

export default config;
