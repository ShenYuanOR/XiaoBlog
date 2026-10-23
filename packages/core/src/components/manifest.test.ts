import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../ast/parse.ts';
import { COMPONENT_VERSION, initialProps, manifest, versionsMatch } from './manifest.ts';

const componentDir = path.resolve(
  import.meta.dirname,
  '../../../../packages/template/src/components/xiao',
);

/** 需要自带子节点的容器类组件（规格 theme-system.md §4）。 */
const CONTAINER_COMPONENTS = [
  'Accordion',
  'Callout',
  'Card',
  'Column',
  'Columns',
  'Container',
  'Grid',
  'Section',
  'Stack',
  'TabPanel',
  'Tabs',
] as const;

function specOf(name: string) {
  const spec = manifest.find((item) => item.name === name);
  if (!spec) throw new Error(`组件清单里没有 ${name}`);
  return spec;
}

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

describe('属性元数据', () => {
  it('每个组件的每条 prop 都有 default，defaults 覆盖并等于它', () => {
    for (const spec of manifest) {
      expect(spec.since, `${spec.name} 的 since 应保持 1.0.0`).toBe('1.0.0');
      const names = spec.props.map((prop) => prop.name);
      expect(new Set(names).size, `${spec.name} 有重名 prop`).toBe(names.length);
      for (const prop of spec.props) {
        expect(prop.default, `${spec.name}.${prop.name} 缺少 default`).not.toBeUndefined();
        expect(
          Object.hasOwn(spec.defaults, prop.name),
          `${spec.name}.defaults 缺少 ${prop.name}`,
        ).toBe(true);
        expect(
          spec.defaults[prop.name],
          `${spec.name}.defaults.${prop.name} 与 prop.default 不一致`,
        ).toEqual(prop.default);
      }
    }
  });

  it('enum 属性都带中文 options，且默认值在取值范围内', () => {
    for (const spec of manifest) {
      for (const prop of spec.props) {
        if (prop.type !== 'enum') continue;
        const options = prop.options ?? [];
        expect(options.length, `${spec.name}.${prop.name} 是 enum 却没有 options`).toBeGreaterThan(
          0,
        );
        const values = options.map((option) => option.value);
        const labels = options.map((option) => option.label);
        expect(new Set(values).size, `${spec.name}.${prop.name} 的 option.value 有重复`).toBe(
          values.length,
        );
        expect(new Set(labels).size, `${spec.name}.${prop.name} 的 option.label 有重复`).toBe(
          labels.length,
        );
        for (const option of options) {
          expect(option.value.length, `${spec.name}.${prop.name} 有空 value`).toBeGreaterThan(0);
          expect(option.label.length, `${spec.name}.${prop.name} 有空 label`).toBeGreaterThan(0);
          expect(
            /[^\x00-\x7f]/.test(option.label),
            `${spec.name}.${prop.name} 的 label 需要中文`,
          ).toBe(true);
        }
        expect(values, `${spec.name}.${prop.name} 的默认值不在 options 里`).toContain(prop.default);
      }
    }
  });

  it('number 属性带单位与 min/max，默认值落在区间内', () => {
    for (const spec of manifest) {
      for (const prop of spec.props) {
        if (prop.type !== 'number') continue;
        expect(prop.unit, `${spec.name}.${prop.name} 缺少 unit`).toBeTruthy();
        expect(typeof prop.min, `${spec.name}.${prop.name} 缺少 min`).toBe('number');
        expect(typeof prop.max, `${spec.name}.${prop.name} 缺少 max`).toBe('number');
        const value = prop.default as number;
        expect(value >= (prop.min ?? 0), `${spec.name}.${prop.name} 的默认值小于 min`).toBe(true);
        expect(value <= (prop.max ?? 0), `${spec.name}.${prop.name} 的默认值大于 max`).toBe(true);
      }
    }
  });
});

describe('initialProps', () => {
  it('返回 defaults 的深拷贝，key 覆盖全部 prop', () => {
    for (const spec of manifest) {
      const initial = initialProps(spec);
      expect(initial, `${spec.name} 的初始属性与 defaults 不一致`).toEqual(spec.defaults);
      expect(initial).not.toBe(spec.defaults);
      for (const prop of spec.props) {
        expect(Object.hasOwn(initial, prop.name), `${spec.name} 缺少 ${prop.name}`).toBe(true);
        const value = initial[prop.name];
        if (Array.isArray(value)) value.push('脏数据');
      }
      expect(initialProps(spec), `${spec.name} 的返回值与清单共享了数组引用`).toEqual(
        spec.defaults,
      );
    }
  });

  it('生成的值类型与 prop 声明一致', () => {
    for (const spec of manifest) {
      const initial = initialProps(spec);
      for (const prop of spec.props) {
        const value = initial[prop.name];
        switch (prop.type) {
          case 'number':
            expect(typeof value, `${spec.name}.${prop.name} 应为数字`).toBe('number');
            expect(Number.isInteger(value as number)).toBe(true);
            break;
          case 'boolean':
            expect(typeof value, `${spec.name}.${prop.name} 应为布尔`).toBe('boolean');
            break;
          case 'list':
            expect(Array.isArray(value), `${spec.name}.${prop.name} 应为数组`).toBe(true);
            break;
          case 'enum':
            expect(typeof value, `${spec.name}.${prop.name} 应为字符串`).toBe('string');
            expect(
              (prop.options ?? []).map((option) => option.value),
              `${spec.name}.${prop.name} 的默认值不在 options 里`,
            ).toContain(value);
            break;
          case 'string':
          case 'image':
          case 'link':
          case 'token':
            expect(typeof value, `${spec.name}.${prop.name} 应为字符串`).toBe('string');
            break;
        }
      }
    }
  });
});

describe('拖入片段', () => {
  it('所有 snippet 都能被 Astro 解析', () => {
    for (const spec of manifest) {
      const { diagnostics } = parseSource(spec.snippet);
      expect(diagnostics, `${spec.name} 的 snippet 解析失败`).toEqual([]);
    }
  });

  it('容器 snippet 带子节点，第一个节点就是组件本身', () => {
    for (const name of CONTAINER_COMPONENTS) {
      const spec = specOf(name);
      const { doc, diagnostics } = parseSource(spec.snippet);
      expect(diagnostics, `${spec.name} 的 snippet 解析失败`).toEqual([]);
      const root = doc.tree[0];
      expect(root?.name, `${spec.name} 的 snippet 顶层节点不对`).toBe(spec.name);
      expect(root?.children.length ?? 0, `${spec.name} 的 snippet 没有子节点`).toBeGreaterThan(0);
    }
  });
});
