/** 版式/骨架的检查器规格。
 *
 * 这些不是可拖入的普通组件（没有对应 components/xiao 文件），
 * 单独放一份供 Studio 的 canvas:props 使用；组件清单测试仍只校验 xiao 组件。
 */
import type { ComponentSpec } from './manifest.ts';

function options(entries: ReadonlyArray<readonly [string, string]>) {
  return entries.map(([value, label]) => ({ value, label }));
}

const sidebarOptions = () =>
  options([
    ['left', '左侧'],
    ['right', '右侧'],
    ['none', '无侧栏'],
  ]);

export const layoutSpecs: ComponentSpec[] = [
  {
    name: 'PageLayout',
    category: 'layout',
    label: '默认页面版式',
    icon: 'square',
    contexts: ['page', 'page-layout'],
    props: [
      {
        name: 'sidebar',
        label: '侧栏',
        type: 'enum',
        options: sidebarOptions(),
        default: 'left',
        group: 'layout',
      },
      {
        name: 'showDescription',
        label: '显示摘要',
        type: 'boolean',
        default: false,
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { sidebar: 'left', showDescription: false },
    snippet: '<PageLayout title="页面"></PageLayout>',
    since: '1.0.0',
  },
  {
    name: 'PostLayout',
    category: 'layout',
    label: '默认文章版式',
    icon: 'square',
    contexts: ['post'],
    props: [
      {
        name: 'sidebar',
        label: '侧栏',
        type: 'enum',
        options: sidebarOptions(),
        default: 'left',
        group: 'layout',
      },
    ],
    children: { allow: '*' },
    defaults: { sidebar: 'left' },
    snippet: '<PostLayout></PostLayout>',
    since: '1.0.0',
  },
];
