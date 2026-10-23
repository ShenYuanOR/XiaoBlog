import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPONENT_VERSION = '1.0.0';

export type PropType =
  'token' | 'enum' | 'number' | 'boolean' | 'string' | 'image' | 'link' | 'list';

export type PropGroup = 'layout' | 'style' | 'content' | 'responsive';

/** 枚举取值：`value` 原样写进源码，`label` 是属性面板上显示的中文文案。 */
export interface PropOption {
  value: string;
  label: string;
}

export interface PropSpec {
  name: string;
  label: string;
  type: PropType;
  /** 枚举取值范围；面板按它渲染下拉框，而不是自由输入。 */
  options?: PropOption[];
  /** 属性未传值或点「恢复默认」时使用的值。 */
  default?: unknown;
  /** 数值属性的单位，例如「列」「级」「条」。 */
  unit?: string;
  /** 数值滑块下界。 */
  min?: number;
  /** 数值滑块上界。 */
  max?: number;
  /** 输入框占位提示，用来提示可用写法（例如 CSS 类后缀）。 */
  placeholder?: string;
  /** 不常用属性，属性面板默认收进「高级」分组。 */
  advanced?: boolean;
  required?: boolean;
  group: PropGroup;
}

export interface ComponentSpec {
  name: string;
  category: 'structure' | 'content' | 'container' | 'blog' | 'embed';
  label: string;
  icon: string;
  props: PropSpec[];
  children: { allow: string[] | '*'; deny?: string[]; text?: boolean };
  defaults: Record<string, unknown>;
  snippet: string;
  since: string;
}

/**
 * 常用取值集合。做成工厂函数，避免多个 prop 共享同一个数组对象被误改。
 */
function optionSet(entries: ReadonlyArray<readonly [string, string]>): PropOption[] {
  return entries.map(([value, label]) => ({ value, label }));
}

const spaceOptions = (): PropOption[] =>
  optionSet([
    ['none', '无'],
    ['xs', '超小'],
    ['sm', '小'],
    ['md', '中'],
    ['lg', '大'],
    ['xl', '超大'],
    ['2xl', '特大'],
  ]);

const widthOptions = (): PropOption[] =>
  optionSet([
    ['narrow', '窄'],
    ['prose', '正文宽'],
    ['wide', '宽'],
    ['full', '通栏'],
  ]);

const alignOptions = (): PropOption[] =>
  optionSet([
    ['start', '左对齐'],
    ['center', '居中'],
    ['end', '右对齐'],
  ]);

const ratioOptions = (): PropOption[] =>
  optionSet([
    ['1:1', '方形'],
    ['4:3', '标准'],
    ['16:9', '宽屏'],
    ['21:9', '超宽'],
  ]);

const autoRatioOptions = (): PropOption[] =>
  optionSet([
    ['auto', '自适应'],
    ...ratioOptions().map((item) => [item.value, item.label] as const),
  ]);

const calloutTypeOptions = (): PropOption[] =>
  optionSet([
    ['info', '信息'],
    ['tip', '提示'],
    ['warn', '警告'],
    ['danger', '危险'],
  ]);

const SPACE_HINT = 'none | xs | sm | md | lg | xl | 2xl';
const COLOR_HINT = 'default | primary | surface | muted | accent | inverse';
const HIDE_ON_HINT = 'mobile | tablet | desktop（可多选）';

export const manifest: ComponentSpec[] = [
  {
    name: 'Accordion',
    category: 'container',
    label: '折叠面板',
    icon: 'square',
    props: [
      {
        name: 'title',
        label: '标题',
        type: 'string',
        default: '折叠标题',
        placeholder: '面板标题',
        group: 'content',
      },
      {
        name: 'open',
        label: '默认展开',
        type: 'boolean',
        default: false,
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { title: '折叠标题', open: false },
    snippet: '<Accordion>\n  <Text>折叠内容</Text>\n</Accordion>',
    since: '1.0.0',
  },
  {
    name: 'Badge',
    category: 'content',
    label: '徽章',
    icon: 'square',
    props: [],
    children: { allow: [], text: true },
    defaults: {},
    snippet: '<Badge>新</Badge>',
    since: '1.0.0',
  },
  {
    name: 'Button',
    category: 'content',
    label: '按钮',
    icon: 'square',
    props: [
      {
        name: 'href',
        label: '链接地址',
        type: 'string',
        default: '#',
        placeholder: '例如 /posts/hello/',
        group: 'content',
      },
    ],
    children: { allow: [], text: true },
    defaults: { href: '#' },
    snippet: '<Button>按钮</Button>',
    since: '1.0.0',
  },
  {
    name: 'Callout',
    category: 'container',
    label: '提示框',
    icon: 'square',
    props: [
      {
        name: 'title',
        label: '标题',
        type: 'string',
        default: '提示',
        placeholder: '提示框标题',
        group: 'content',
      },
      {
        name: 'type',
        label: '类型',
        type: 'enum',
        options: calloutTypeOptions(),
        default: 'info',
        group: 'style',
      },
    ],
    children: { allow: '*' },
    defaults: { title: '提示', type: 'info' },
    snippet: '<Callout>\n  <Text>提示内容</Text>\n</Callout>',
    since: '1.0.0',
  },
  {
    name: 'Card',
    category: 'container',
    label: '卡片',
    icon: 'square',
    props: [
      {
        name: 'pad',
        label: '内边距',
        type: 'string',
        default: 'md',
        placeholder: SPACE_HINT,
        group: 'style',
      },
      {
        name: 'bg',
        label: '背景',
        type: 'string',
        default: 'surface',
        placeholder: COLOR_HINT,
        group: 'style',
      },
      {
        name: 'hideOn',
        label: '断点隐藏',
        type: 'string',
        default: '',
        placeholder: HIDE_ON_HINT,
        advanced: true,
        group: 'responsive',
      },
      {
        name: 'href',
        label: '整卡链接',
        type: 'string',
        default: '',
        placeholder: '例如 /posts/hello/',
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { pad: 'md', bg: 'surface', hideOn: '', href: '' },
    snippet: '<Card>\n  <Text>卡片内容</Text>\n</Card>',
    since: '1.0.0',
  },
  {
    name: 'CategoryTree',
    category: 'blog',
    label: '分类树',
    icon: 'square',
    props: [],
    children: { allow: '*' },
    defaults: {},
    snippet: '<CategoryTree></CategoryTree>',
    since: '1.0.0',
  },
  {
    name: 'Code',
    category: 'content',
    label: '代码块',
    icon: 'square',
    props: [
      {
        name: 'code',
        label: '代码',
        type: 'string',
        default: 'console.log("hello");',
        placeholder: '要显示的代码',
        group: 'content',
      },
    ],
    children: { allow: [], text: true },
    defaults: { code: 'console.log("hello");' },
    snippet: '<Code></Code>',
    since: '1.0.0',
  },
  {
    name: 'Column',
    category: 'structure',
    label: '分栏',
    icon: 'square',
    props: [
      {
        name: 'pad',
        label: '内边距',
        type: 'string',
        default: 'md',
        placeholder: SPACE_HINT,
        group: 'style',
      },
      {
        name: 'bg',
        label: '背景',
        type: 'string',
        default: 'surface',
        placeholder: COLOR_HINT,
        group: 'style',
      },
      {
        name: 'hideOn',
        label: '断点隐藏',
        type: 'string',
        default: '',
        placeholder: HIDE_ON_HINT,
        advanced: true,
        group: 'responsive',
      },
    ],
    children: { allow: '*' },
    defaults: { pad: 'md', bg: 'surface', hideOn: '' },
    snippet: '<Column>\n  <Text>分栏内容</Text>\n</Column>',
    since: '1.0.0',
  },
  {
    name: 'Columns',
    category: 'structure',
    label: '分栏组',
    icon: 'square',
    props: [
      {
        name: 'pad',
        label: '内边距',
        type: 'string',
        default: 'md',
        placeholder: SPACE_HINT,
        group: 'style',
      },
      {
        name: 'bg',
        label: '背景',
        type: 'string',
        default: 'surface',
        placeholder: COLOR_HINT,
        group: 'style',
      },
      {
        name: 'hideOn',
        label: '断点隐藏',
        type: 'string',
        default: '',
        placeholder: HIDE_ON_HINT,
        advanced: true,
        group: 'responsive',
      },
      {
        name: 'cols',
        label: '列数',
        type: 'number',
        default: 2,
        unit: '列',
        min: 1,
        max: 4,
        group: 'layout',
      },
      {
        name: 'gap',
        label: '间距',
        type: 'enum',
        options: spaceOptions(),
        default: 'md',
        group: 'layout',
      },
    ],
    children: { allow: '*' },
    defaults: { pad: 'md', bg: 'surface', hideOn: '', cols: 2, gap: 'md' },
    snippet:
      '<Columns>\n  <Column>\n    <Text>第一栏</Text>\n  </Column>\n  <Column>\n    <Text>第二栏</Text>\n  </Column>\n</Columns>',
    since: '1.0.0',
  },
  {
    name: 'Container',
    category: 'structure',
    label: '容器',
    icon: 'square',
    props: [
      {
        name: 'pad',
        label: '内边距',
        type: 'string',
        default: 'md',
        placeholder: SPACE_HINT,
        group: 'style',
      },
      {
        name: 'bg',
        label: '背景',
        type: 'string',
        default: 'surface',
        placeholder: COLOR_HINT,
        group: 'style',
      },
      {
        name: 'hideOn',
        label: '断点隐藏',
        type: 'string',
        default: '',
        placeholder: HIDE_ON_HINT,
        advanced: true,
        group: 'responsive',
      },
      {
        name: 'width',
        label: '内容宽度',
        type: 'enum',
        options: widthOptions(),
        default: 'prose',
        group: 'layout',
      },
      {
        name: 'align',
        label: '对齐',
        type: 'enum',
        options: alignOptions(),
        default: 'start',
        group: 'layout',
      },
    ],
    children: { allow: '*' },
    defaults: { pad: 'md', bg: 'surface', hideOn: '', width: 'prose', align: 'start' },
    snippet: '<Container>\n  <Text>正文</Text>\n</Container>',
    since: '1.0.0',
  },
  {
    name: 'Divider',
    category: 'content',
    label: '分隔线',
    icon: 'square',
    props: [],
    children: { allow: '*' },
    defaults: {},
    snippet: '<Divider></Divider>',
    since: '1.0.0',
  },
  {
    name: 'Embed',
    category: 'embed',
    label: '嵌入',
    icon: 'square',
    props: [
      {
        name: 'src',
        label: '嵌入地址',
        type: 'string',
        default: '',
        placeholder: '例如 https://example.com/embed',
        group: 'content',
      },
      {
        name: 'title',
        label: '标题',
        type: 'string',
        default: '嵌入',
        placeholder: 'iframe 的 title',
        group: 'content',
      },
      {
        name: 'ratio',
        label: '宽高比',
        type: 'enum',
        options: ratioOptions(),
        default: '16:9',
        group: 'style',
      },
    ],
    children: { allow: '*' },
    defaults: { src: '', title: '嵌入', ratio: '16:9' },
    snippet: '<Embed></Embed>',
    since: '1.0.0',
  },
  {
    name: 'Gallery',
    category: 'embed',
    label: '图库',
    icon: 'square',
    props: [
      {
        name: 'images',
        label: '图片列表',
        type: 'list',
        default: [],
        placeholder: '每项包含 src 与 alt',
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { images: [] },
    snippet: '<Gallery></Gallery>',
    since: '1.0.0',
  },
  {
    name: 'Grid',
    category: 'structure',
    label: '网格',
    icon: 'square',
    props: [
      {
        name: 'pad',
        label: '内边距',
        type: 'string',
        default: 'md',
        placeholder: SPACE_HINT,
        group: 'style',
      },
      {
        name: 'bg',
        label: '背景',
        type: 'string',
        default: 'surface',
        placeholder: COLOR_HINT,
        group: 'style',
      },
      {
        name: 'hideOn',
        label: '断点隐藏',
        type: 'string',
        default: '',
        placeholder: HIDE_ON_HINT,
        advanced: true,
        group: 'responsive',
      },
      {
        name: 'gap',
        label: '间距',
        type: 'enum',
        options: spaceOptions(),
        default: 'md',
        group: 'layout',
      },
    ],
    children: { allow: '*' },
    defaults: { pad: 'md', bg: 'surface', hideOn: '', gap: 'md' },
    snippet:
      '<Grid>\n  <Card>\n    <Text>卡片一</Text>\n  </Card>\n  <Card>\n    <Text>卡片二</Text>\n  </Card>\n</Grid>',
    since: '1.0.0',
  },
  {
    name: 'Heading',
    category: 'content',
    label: '标题',
    icon: 'square',
    props: [
      {
        name: 'level',
        label: '标题级别',
        type: 'number',
        default: 2,
        unit: '级',
        min: 1,
        max: 6,
        group: 'content',
      },
    ],
    children: { allow: [], text: true },
    defaults: { level: 2 },
    snippet: '<Heading>标题</Heading>',
    since: '1.0.0',
  },
  {
    name: 'Html',
    category: 'embed',
    label: '自定义 HTML',
    icon: 'square',
    props: [],
    children: { allow: '*' },
    defaults: {},
    snippet: '<Html></Html>',
    since: '1.0.0',
  },
  {
    name: 'Icon',
    category: 'content',
    label: '图标',
    icon: 'square',
    props: [
      {
        name: 'name',
        label: '图标名',
        type: 'string',
        default: 'mark',
        placeholder: '例如 mark',
        group: 'content',
      },
    ],
    children: { allow: [], text: true },
    defaults: { name: 'mark' },
    snippet: '<Icon></Icon>',
    since: '1.0.0',
  },
  {
    name: 'Image',
    category: 'embed',
    label: '图片',
    icon: 'square',
    props: [
      {
        name: 'src',
        label: '图片地址',
        type: 'string',
        default: '',
        placeholder: '例如 /images/cover.jpg',
        group: 'content',
      },
      {
        name: 'alt',
        label: '替代文本',
        type: 'string',
        default: '图片说明',
        placeholder: '描述图片内容，便于无障碍阅读',
        required: true,
        group: 'content',
      },
      {
        name: 'caption',
        label: '图注',
        type: 'string',
        default: '',
        placeholder: '显示在图片下方的说明',
        group: 'content',
      },
      {
        name: 'ratio',
        label: '宽高比',
        type: 'enum',
        options: autoRatioOptions(),
        default: 'auto',
        group: 'style',
      },
    ],
    children: { allow: '*' },
    defaults: { src: '', alt: '图片说明', caption: '', ratio: 'auto' },
    snippet: '<Image></Image>',
    since: '1.0.0',
  },
  {
    name: 'Link',
    category: 'content',
    label: '链接',
    icon: 'square',
    props: [
      {
        name: 'href',
        label: '链接地址',
        type: 'string',
        default: '#',
        placeholder: '例如 /posts/hello/',
        group: 'content',
      },
    ],
    children: { allow: [], text: true },
    defaults: { href: '#' },
    snippet: '<Link>链接文字</Link>',
    since: '1.0.0',
  },
  {
    name: 'Pagination',
    category: 'blog',
    label: '翻页',
    icon: 'square',
    props: [
      {
        name: 'prev',
        label: '上一页链接',
        type: 'string',
        default: '',
        placeholder: '例如 /page/1/',
        advanced: true,
        group: 'content',
      },
      {
        name: 'next',
        label: '下一页链接',
        type: 'string',
        default: '',
        placeholder: '例如 /page/3/',
        advanced: true,
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { prev: '', next: '' },
    snippet: '<Pagination></Pagination>',
    since: '1.0.0',
  },
  {
    name: 'PostCard',
    category: 'blog',
    label: '文章卡片',
    icon: 'square',
    props: [
      {
        name: 'slug',
        label: '文章 slug',
        type: 'string',
        default: 'hello',
        placeholder: '例如 hello',
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { slug: 'hello' },
    snippet: '<PostCard></PostCard>',
    since: '1.0.0',
  },
  {
    name: 'PostList',
    category: 'blog',
    label: '文章列表',
    icon: 'square',
    props: [
      {
        name: 'limit',
        label: '数量上限',
        type: 'number',
        default: 20,
        unit: '条',
        min: 1,
        max: 100,
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { limit: 20 },
    snippet: '<PostList></PostList>',
    since: '1.0.0',
  },
  {
    name: 'Profile',
    category: 'blog',
    label: '作者信息',
    icon: 'square',
    props: [],
    children: { allow: '*' },
    defaults: {},
    snippet: '<Profile></Profile>',
    since: '1.0.0',
  },
  {
    name: 'Quote',
    category: 'content',
    label: '引用',
    icon: 'square',
    props: [
      {
        name: 'cite',
        label: '出处',
        type: 'string',
        default: '',
        placeholder: '引用来源',
        group: 'content',
      },
    ],
    children: { allow: [], text: true },
    defaults: { cite: '' },
    snippet: '<Quote>引用内容</Quote>',
    since: '1.0.0',
  },
  {
    name: 'RichText',
    category: 'content',
    label: '富文本',
    icon: 'square',
    props: [],
    children: { allow: [], text: true },
    defaults: {},
    snippet: '<RichText>正文内容</RichText>',
    since: '1.0.0',
  },
  {
    name: 'Section',
    category: 'structure',
    label: '区块',
    icon: 'square',
    props: [
      {
        name: 'pad',
        label: '内边距',
        type: 'string',
        default: 'md',
        placeholder: SPACE_HINT,
        group: 'style',
      },
      {
        name: 'bg',
        label: '背景',
        type: 'string',
        default: 'surface',
        placeholder: COLOR_HINT,
        group: 'style',
      },
      {
        name: 'hideOn',
        label: '断点隐藏',
        type: 'string',
        default: '',
        placeholder: HIDE_ON_HINT,
        advanced: true,
        group: 'responsive',
      },
      {
        name: 'width',
        label: '内容宽度',
        type: 'enum',
        options: widthOptions(),
        default: 'full',
        group: 'layout',
      },
    ],
    children: { allow: '*' },
    defaults: { pad: 'md', bg: 'surface', hideOn: '', width: 'full' },
    snippet: '<Section>\n  <Text>正文</Text>\n</Section>',
    since: '1.0.0',
  },
  {
    name: 'Spacer',
    category: 'content',
    label: '留白',
    icon: 'square',
    props: [
      {
        name: 'size',
        label: '间距尺寸',
        type: 'enum',
        options: spaceOptions(),
        default: 'md',
        group: 'layout',
      },
    ],
    children: { allow: '*' },
    defaults: { size: 'md' },
    snippet: '<Spacer></Spacer>',
    since: '1.0.0',
  },
  {
    name: 'Stack',
    category: 'structure',
    label: '堆叠',
    icon: 'square',
    props: [
      {
        name: 'pad',
        label: '内边距',
        type: 'string',
        default: 'md',
        placeholder: SPACE_HINT,
        group: 'style',
      },
      {
        name: 'bg',
        label: '背景',
        type: 'string',
        default: 'surface',
        placeholder: COLOR_HINT,
        group: 'style',
      },
      {
        name: 'hideOn',
        label: '断点隐藏',
        type: 'string',
        default: '',
        placeholder: HIDE_ON_HINT,
        advanced: true,
        group: 'responsive',
      },
      {
        name: 'direction',
        label: '排列方向',
        type: 'string',
        default: 'column',
        placeholder: 'column | row',
        group: 'layout',
      },
      {
        name: 'gap',
        label: '间距',
        type: 'enum',
        options: spaceOptions(),
        default: 'md',
        group: 'layout',
      },
      {
        name: 'align',
        label: '交叉轴对齐',
        type: 'enum',
        options: alignOptions(),
        default: 'start',
        group: 'layout',
      },
      {
        name: 'justify',
        label: '主轴对齐',
        type: 'string',
        default: 'start',
        placeholder: 'start | center | end | between',
        group: 'layout',
      },
      {
        name: 'wrap',
        label: '自动换行',
        type: 'boolean',
        default: false,
        advanced: true,
        group: 'layout',
      },
    ],
    children: { allow: '*' },
    defaults: {
      pad: 'md',
      bg: 'surface',
      hideOn: '',
      direction: 'column',
      gap: 'md',
      align: 'start',
      justify: 'start',
      wrap: false,
    },
    snippet: '<Stack>\n  <Text>第一项</Text>\n  <Text>第二项</Text>\n</Stack>',
    since: '1.0.0',
  },
  {
    name: 'TabPanel',
    category: 'container',
    label: '标签面板',
    icon: 'square',
    props: [],
    children: { allow: '*' },
    defaults: {},
    snippet: '<TabPanel>\n  <Text>面板内容</Text>\n</TabPanel>',
    since: '1.0.0',
  },
  {
    name: 'Tabs',
    category: 'container',
    label: '标签页',
    icon: 'square',
    props: [
      {
        name: 'labels',
        label: '标签列表',
        type: 'list',
        default: ['标签一', '标签二'],
        placeholder: '每个标签一段文字',
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { labels: ['标签一', '标签二'] },
    snippet:
      '<Tabs>\n  <TabPanel>\n    <Text>面板一</Text>\n  </TabPanel>\n  <TabPanel>\n    <Text>面板二</Text>\n  </TabPanel>\n</Tabs>',
    since: '1.0.0',
  },
  {
    name: 'TagCloud',
    category: 'blog',
    label: '标签云',
    icon: 'square',
    props: [
      {
        name: 'limit',
        label: '标签数量',
        type: 'number',
        default: 20,
        unit: '条',
        min: 1,
        max: 100,
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { limit: 20 },
    snippet: '<TagCloud></TagCloud>',
    since: '1.0.0',
  },
  {
    name: 'Text',
    category: 'content',
    label: '文本',
    icon: 'square',
    props: [],
    children: { allow: [], text: true },
    defaults: {},
    snippet: '<Text>正文</Text>',
    since: '1.0.0',
  },
  {
    name: 'Toc',
    category: 'blog',
    label: '目录',
    icon: 'square',
    props: [
      {
        name: 'headings',
        label: '标题列表',
        type: 'list',
        default: [],
        placeholder: '由文章布局自动注入',
        advanced: true,
        group: 'content',
      },
    ],
    children: { allow: '*' },
    defaults: { headings: [] },
    snippet: '<Toc></Toc>',
    since: '1.0.0',
  },
  {
    name: 'Video',
    category: 'embed',
    label: '视频',
    icon: 'square',
    props: [
      {
        name: 'src',
        label: '视频地址',
        type: 'string',
        default: '',
        placeholder: '例如 /media/demo.mp4',
        group: 'content',
      },
      {
        name: 'ratio',
        label: '宽高比',
        type: 'enum',
        options: ratioOptions(),
        default: '16:9',
        group: 'style',
      },
    ],
    children: { allow: '*' },
    defaults: { src: '', ratio: '16:9' },
    snippet: '<Video></Video>',
    since: '1.0.0',
  },
];

/** 深拷贝初始属性，避免面板改动返回值时污染清单里的常量。 */
function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => cloneValue(item)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        cloneValue(item),
      ]),
    ) as unknown as T;
  }
  return value;
}

/**
 * 生成拖入画布时的初始属性（规格 theme-system.md §4）：
 * 先取每条 prop 的 `default`，再用组件级 `defaults` 覆盖一遍，
 * 因此 `defaults` 是插入时真正写进源码的那组值，`default` 是单条属性的兜底值。
 */
export function initialProps(spec: ComponentSpec): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const prop of spec.props) {
    if (prop.default !== undefined) props[prop.name] = cloneValue(prop.default);
  }
  for (const [name, value] of Object.entries(spec.defaults)) {
    props[name] = cloneValue(value);
  }
  return props;
}

export function templateVersionFile(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/template/src/components/xiao/VERSION',
  );
}

export function versionsMatch(disk = readFileSync(templateVersionFile(), 'utf8').trim()): boolean {
  return manifest.every((item) => item.since === disk) && disk === COMPONENT_VERSION;
}
