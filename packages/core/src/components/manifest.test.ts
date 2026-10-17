import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENT_VERSION, manifest, versionsMatch } from './manifest.ts';

const componentDir = path.resolve(
  import.meta.dirname,
  '../../../../packages/template/src/components/xiao',
);

describe('组件清单', () => {
  it('覆盖全部组件，版本与 VERSION 一致', () => {
    const files = readdirSync(componentDir)
      .filter((name) => name.endsWith('.astro'))
      .map((name) => name.replace(/\.astro$/, ''))
      .sort();
    expect(manifest.map((item) => item.name).sort()).toEqual(files);
    expect(versionsMatch(readFileSync(path.join(componentDir, 'VERSION'), 'utf8').trim())).toBe(
      true,
    );
    expect(COMPONENT_VERSION).toBe('1.0.0');
  });

  it('清单里的每个 prop 都出现在组件源码里', () => {
    for (const spec of manifest) {
      const source = readFileSync(path.join(componentDir, `${spec.name}.astro`), 'utf8');
      for (const prop of spec.props) expect(source).toContain(prop.name);
    }
  });
});
