/**
 * HTML 文章画布用的片段：和页面组件同一套名字，落盘是带 xiao.css 类名的 HTML。
 * 站点用 set:html 原样输出，不能写 <Card> 这种 Astro 标签。
 */

const SNIPPETS: Record<string, string> = {
  Section: '<section class="x-box x-width-full" data-xiao="section"></section>',
  Container: '<div class="x-box x-pad-md" data-xiao="container"></div>',
  Stack: '<div class="x-box x-stack x-dir-column x-gap-md" data-xiao="stack"></div>',
  Grid: '<div class="x-box x-grid x-gap-md" data-xiao="grid"></div>',
  Columns: '<div class="x-box x-grid x-cols-2 x-gap-md" data-xiao="columns"></div>',
  Column: '<div class="x-box" data-xiao="column"></div>',
  Card: '<article class="x-box x-pad-md x-bg-surface x-card" data-xiao="card"></article>',
  Callout: '<aside class="x-callout" data-xiao="callout" data-type="info"><p>提示内容</p></aside>',
  Accordion:
    '<details class="x-box x-pad-md" data-xiao="accordion"><summary>折叠标题</summary><p>折叠内容</p></details>',
  Tabs: '<div class="x-box" data-xiao="tabs"></div>',
  TabPanel: '<div class="x-box x-pad-md" data-xiao="tabpanel"></div>',
  Text: '<p data-xiao="text">文本</p>',
  Heading: '<h2 data-xiao="heading">标题</h2>',
  RichText: '<div class="x-prose" data-xiao="richtext"><p>正文</p></div>',
  Quote: '<blockquote class="x-quote x-box x-pad-md" data-xiao="quote">引用</blockquote>',
  Code: '<pre class="x-code x-box x-pad-md" data-xiao="code"><code>code</code></pre>',
  Badge: '<span data-xiao="badge">新</span>',
  Button: '<a class="x-button" data-xiao="button" href="#">按钮</a>',
  Link: '<a class="x-link" data-xiao="link" href="#">链接</a>',
  Icon: '<span data-xiao="icon"></span>',
  Divider: '<hr data-xiao="divider" />',
  Spacer: '<div class="x-pad-md" data-xiao="spacer"></div>',
  Image: '<figure class="x-box" data-xiao="image"><img src="" alt="" /></figure>',
  Gallery: '<div class="x-box x-grid x-gap-md" data-xiao="gallery"></div>',
  Video: '<div class="x-box" data-xiao="video"></div>',
  Embed: '<div class="x-box x-pad-md" data-xiao="embed"></div>',
  Html: '<div class="x-box" data-xiao="html"></div>',
};

const CLASS_TO_NAME: Array<[RegExp, string]> = [
  [/\bx-card\b/, 'Card'],
  [/\bx-callout\b/, 'Callout'],
  [/\bx-button\b/, 'Button'],
  [/\bx-quote\b/, 'Quote'],
  [/\bx-code\b/, 'Code'],
  [/\bx-stack\b/, 'Stack'],
  [/\bx-cols-/, 'Columns'],
  [/\bx-grid\b/, 'Grid'],
  [/\bx-prose\b/, 'RichText'],
  [/\bx-width-/, 'Section'],
];

function toPascal(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function htmlSnippet(name: string): string {
  return SNIPPETS[name] ?? `<div class="x-box" data-xiao="${name.toLowerCase()}"></div>`;
}

export function htmlNodeComponent(
  tagName: string,
  props: readonly { name: string; value: string }[],
): string {
  const xiao = props.find((item) => item.name === 'data-xiao')?.value;
  if (xiao) return toPascal(xiao);
  const cls = props.find((item) => item.name === 'class')?.value ?? '';
  for (const [pattern, name] of CLASS_TO_NAME) {
    if (pattern.test(cls)) return name;
  }
  if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') return 'Heading';
  if (tagName === 'p') return 'Text';
  if (tagName === 'a') return 'Link';
  if (tagName === 'hr') return 'Divider';
  if (tagName === 'img' || tagName === 'figure') return 'Image';
  if (tagName === 'blockquote') return 'Quote';
  if (tagName === 'pre') return 'Code';
  return tagName;
}
