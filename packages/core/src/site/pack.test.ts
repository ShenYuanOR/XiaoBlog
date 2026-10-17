import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  packageLimit,
  readPackFlags,
  withinPackageLimit,
} from '../../../../apps/studio/src/main/pack.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('打包和更新', () => {
  it('配置打开了 fuse、解包和引导，体积上限 230 MB', () => {
    const yml = readFileSync(path.join(root, 'apps/studio/electron-builder.yml'), 'utf8');
    expect(readPackFlags(yml)).toEqual({ unpackNode: true, runAsNode: true, guides: true });
    expect(withinPackageLimit(packageLimit)).toBe(true);
    expect(withinPackageLimit(packageLimit + 1)).toBe(false);
  });
});
