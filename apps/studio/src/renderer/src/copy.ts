import type { IconName } from './icons.ts';

export type NavKey = 'posts' | 'pages' | 'appearance' | 'seo' | 'publish' | 'settings';

export interface NavItem {
  key: NavKey;
  label: string;
  icon: IconName;
  hint: string;
}

export const navItems: NavItem[] = [
  { key: 'posts', label: '文章', icon: 'posts', hint: '写文章、改属性、看草稿' },
  { key: 'pages', label: '页面', icon: 'pages', hint: '首页、关于页、落地页的布局' },
  { key: 'appearance', label: '外观', icon: 'appearance', hint: '主题、颜色、字体、预设' },
  { key: 'seo', label: 'SEO', icon: 'seo', hint: '标题、摘要、分享卡片、死链' },
  { key: 'publish', label: '发布', icon: 'publish', hint: '改动清单、体检、推送' },
  { key: 'settings', label: '设置', icon: 'settings', hint: '站点信息、导航、作者' },
];

export function navLabel(key: NavKey): string {
  return navItems.find((item) => item.key === key)?.label ?? key;
}

export const copy = {
  appName: '晓',
  modeWrite: '创作',
  modeDevelop: '开发者',
  preview: '预览',
  publish: '发布',
  list: '列表',
  editor: '编辑区',

  // 兼容旧视图的字段
  nav: ['文章', '页面', '外观', 'SEO', '设置', '发布'],
  empty: '从欢迎页新建或打开一个站点后，文章会列在这里。',
  welcomeTitle: '晓',
  welcomeLead: '新建一个笔记站，或打开已有的文件夹。',
  sideNote: '这里以后是分类树或页面列表。',
  previewNote: '这里以后是实时预览和属性。',
  conflictLead: '文件在外面被改了：',
  keepMine: '保留我的修改',
  loadDisk: '载入磁盘版本',
  compare: '对比',

  // v2
  site: '站点',
  openSite: '打开站点',
  newSite: '新建站点',
  recent: '最近打开',
  search: '搜索',
  newPost: '新建文章',
  newPage: '新建页面',
  commandHint: '输入命令或搜索…',
  saved: '已保存',
  dirty: '有改动',
  saving: '保存中…',
  conflict: '有冲突',
  devPort: 'dev',
  notBuilt: '未构建',
  building: '构建中…',
  inspector: '检查器',
  outline: '大纲',
  properties: '属性',
  pageStyle: '页面样式',
  dockOn: '停靠预览',
  dockOff: '收起预览',
  windowPreview: '独立窗口',
  developTitle: '开发者模式',
  files: '文件',
  output: '输出',
  problems: '问题',
  emptyTitle: '这里还是空的',
  emptyPost: '选一篇文章，或新建一篇开始写。',
  emptyPage: '选一个页面开始搭，或新建一个页面。',
  emptyPreview: '启动预览后才能看到页面。',
  startPreview: '启动预览',
} as const;

export type Copy = typeof copy;
