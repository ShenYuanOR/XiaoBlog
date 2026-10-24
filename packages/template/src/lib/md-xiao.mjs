/** 把文章 Markdown 里的晓组件标签换成带 xiao.css 类名的 HTML，预览和构建才能看见卡片而不是生标签。 */

const TAGS = {
  section: ['section', 'x-box x-width-full'],
  container: ['div', 'x-box x-pad-md'],
  stack: ['div', 'x-box x-stack x-dir-column x-gap-md'],
  grid: ['div', 'x-box x-grid x-gap-md'],
  columns: ['div', 'x-box x-grid x-cols-2 x-gap-md'],
  column: ['div', 'x-box'],
  card: ['article', 'x-box x-pad-md x-bg-surface x-card'],
  callout: ['aside', 'x-callout'],
  accordion: ['details', 'x-box x-pad-md'],
  tabs: ['div', 'x-box'],
  tabpanel: ['div', 'x-box x-pad-md'],
  text: ['p', ''],
  heading: ['h2', ''],
  richtext: ['div', 'x-prose'],
  quote: ['blockquote', 'x-quote x-box x-pad-md'],
  code: ['pre', 'x-code x-box x-pad-md'],
  badge: ['span', ''],
  button: ['span', 'x-button'],
  link: ['a', 'x-link'],
  icon: ['span', ''],
  divider: ['hr', ''],
  spacer: ['div', 'x-pad-md'],
  postlist: ['aside', 'x-box x-pad-md x-card'],
  postcard: ['article', 'x-box x-pad-md x-card'],
  categorytree: ['nav', 'x-box x-pad-md'],
  tagcloud: ['div', 'x-box x-pad-md'],
  pagination: ['nav', 'x-box x-pad-md'],
  profile: ['aside', 'x-box x-pad-md x-card'],
  toc: ['nav', 'x-box x-pad-md'],
  image: ['figure', 'x-box'],
  gallery: ['div', 'x-box x-grid x-gap-md'],
  video: ['div', 'x-box'],
  embed: ['div', 'x-box x-pad-md'],
  html: ['div', 'x-box'],
};

function classList(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  return [];
}

export function rewriteHtmlString(html) {
  let out = html;
  for (const [key, spec] of Object.entries(TAGS)) {
    const [tag, cls] = spec;
    const extra = cls ? ` class="${cls}"` : '';
    out = out.replace(new RegExp(`<${key}(\\s[^>]*)?>`, 'gi'), (_m, attrs = '') => {
      return `<${tag} data-xiao="${key}"${extra}${attrs}>`;
    });
    out = out.replace(new RegExp(`</${key}>`, 'gi'), `</${tag}>`);
  }
  return out;
}

function rewriteElement(node) {
  const key = String(node.tagName || '').toLowerCase();
  const spec = TAGS[key];
  if (!spec) return;
  const props = node.properties && typeof node.properties === 'object' ? node.properties : {};
  node.tagName = spec[0];
  node.properties = {
    ...props,
    className: [
      ...spec[1].split(/\s+/).filter(Boolean),
      ...classList(props.className),
      ...classList(props.class),
    ],
    'data-xiao': key,
  };
}

/** Sätteri HAST 插件（若站点显式接入 processor）。 */
export function xiaoMarkdownComponents() {
  return {
    name: 'xiao-markdown-components',
    element: {
      filter: Object.keys(TAGS),
      visit(node) {
        rewriteElement(node);
      },
    },
  };
}

/** 不依赖 Sätteri：在 Vite 读 Markdown 时把晓标签改成带类名的 HTML。 */
export function xiaoMarkdownIntegration() {
  return {
    name: 'xiao-markdown-components',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'xiao-md-tags',
                enforce: 'pre',
                transform(code, id) {
                  const file = String(id).replace(/\\/g, '/').split('?')[0];
                  if (!file.includes('/content/posts/') || !file.endsWith('.md')) return;
                  const next = rewriteHtmlString(code);
                  return next === code ? null : next;
                },
              },
            ],
          },
        });
      },
    },
  };
}
