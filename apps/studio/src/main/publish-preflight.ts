import { SEO_RULE_LABELS, placeholderUrl } from './seo.ts';

export interface PreflightItem {
  key: 'url' | 'workflow' | 'build' | 'seo';
  ok: boolean;
  label: string;
  detail: string;
  /** 可展开的原文。已经去掉堆栈，路径相对站点。 */
  more: string;
  /** 能定位到文章时给出 slug，入口才是「打开这篇文章」。 */
  slug: string;
  action: '' | 'seo' | 'settings' | 'apply-url' | 'open-post';
}

export interface PreflightInput {
  siteUrl: string;
  targetUrl: string;
  workflowReady: boolean;
  buildFailed: boolean;
  buildMessage: string;
  /** 构建日志。比截短后的 buildMessage 更全，用来认出文章和图片。 */
  buildLog?: string;
  postTitles?: Record<string, string>;
  errors: { rule: string; detail: string }[];
}

export type LocalBuildKind = 'frontmatter' | 'image' | 'config' | 'other';

export interface LocalBuildExplanation {
  kind: LocalBuildKind;
  summary: string;
  detail: string;
  slug: string;
}

function relativize(line: string): string {
  return line.replace(/[A-Za-z]:[\\/][^\s"'`)]+|\/workspace\/[^\s"'`)]+/g, (path) => {
    const slash = path.replace(/\\/g, '/');
    const at = slash.search(/(?:^|\/)(?:src\/|node_modules\/|public\/|xiao\.config\.json)/);
    if (at < 0) return slash.split('/').pop() ?? slash;
    return slash.slice(at).replace(/^\//, '');
  });
}

function cleanBuildDetail(log: string): string {
  const plain = log.replace(/\u001b\[[0-9;]*m/g, '');
  const kept: string[] = [];
  for (const line of plain.split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    if (/stack trace:?$/i.test(text)) break;
    if (/^at\s/i.test(text)) continue;
    if (text.includes('[ELIFECYCLE]')) continue;
    kept.push(relativize(line).trim());
  }
  const start = kept.findIndex((line) =>
    /flow sequence|block mapping|implicit key|image not found|could not find requested image|typo in the image path|xiao\.config\.json|error:|hint:|location:/i.test(
      line,
    ),
  );
  return (start >= 0 ? kept.slice(start) : kept.slice(-8)).join('\n').trim();
}

function postInLog(log: string): { slug: string; line: string } | null {
  const withLine = [...log.matchAll(/src[/\\]content[/\\]posts[/\\]([^/\\:\s]+)[/\\][^\s:'"]*?:(\d+):\d+/g)];
  const lined = withLine.at(-1);
  if (lined?.[1]) return { slug: lined[1], line: lined[2] ?? '' };
  const loose = [...log.matchAll(/src[/\\]content[/\\]posts[/\\]([^/\\:\s]+)/g)].at(-1);
  return loose?.[1] ? { slug: loose[1], line: '' } : null;
}

function imageInLog(log: string): string {
  const raw =
    log.match(/Could not find requested image [`'"]([^`'"]+)[`'"]/i)?.[1] ??
    log.match(/(\/media\/[^\s`'")]+\.(?:png|jpe?g|gif|webp|avif|svg))/i)?.[1] ??
    '';
  if (!raw) return '';
  const slash = raw.replace(/\\/g, '/');
  if (slash.startsWith('/')) return slash;
  const publicAt = slash.search(/(?:^|\/)public\//);
  if (publicAt >= 0) return `/${slash.slice(publicAt).replace(/^(?:\/)?public\//, '')}`;
  const at = slash.search(/(?:^|\/)src\//);
  if (at >= 0) return slash.slice(at).replace(/^\//, '');
  return slash.split('/').pop() ?? slash;
}

/** 把本地构建失败说成中文。原文留在 detail，堆栈和本机绝对路径不留给界面。 */
export function explainLocalBuild(log: string, titles: Record<string, string> = {}): LocalBuildExplanation {
  const detail = cleanBuildDetail(log);
  const post = postInLog(log);
  const name = post ? `《${titles[post.slug] || post.slug}》` : '';
  if (/image not found|could not find requested image|typo in the image path/i.test(log)) {
    const file = imageInLog(log) || '图片';
    const summary = post ? `文章${name}的封面图 ${file} 找不到` : `封面图 ${file} 找不到`;
    return { kind: 'image', summary, detail, slug: post?.slug ?? '' };
  }
  if (/flow sequence|block mapping|implicit key|YAMLParseError|YAMLException|mapping values are not allowed/i.test(log)) {
    const where = post?.line ? `第 ${post.line} 行` : '';
    const summary = post ? `文章${name}开头信息${where}写法不对` : '文章开头信息写法不对';
    return { kind: 'frontmatter', summary, detail, slug: post?.slug ?? '' };
  }
  if (/xiao\.config\.json/.test(log)) {
    const fields = log.match(/字段无效[:：]\s*([^\r\n]+)/)?.[1]?.trim() ?? '';
    return {
      kind: 'config',
      summary: fields ? `站点配置 xiao.config.json 校验失败：${fields}` : '站点配置 xiao.config.json 校验失败',
      detail,
      slug: '',
    };
  }
  return { kind: 'other', summary: detail || '构建没有通过', detail, slug: '' };
}

const REPORT_LABELS: Record<string, string> = {
  'html-lang-missing': '页面缺少语言',
  'title-missing': '页面没有标题',
  'description-missing': '页面没有摘要',
  'canonical-missing': '页面没有规范地址',
  'canonical-invalid': '规范地址不对',
  'og-image-missing-file': '分享图文件不存在',
  'h1-count': '主标题数量不对',
  'img-alt-missing': '图片缺少替代文字',
};

export function siteBaseFromUrl(url: string): string {
  const path = new URL(url).pathname;
  if (!path || path === '/') return '/';
  return path.endsWith('/') ? path : `${path}/`;
}

function sameUrl(left: string, right: string): boolean {
  return left.trim().replace(/\/+$/, '') === right.trim().replace(/\/+$/, '');
}

function reason(rule: string, detail: string): string {
  const name = SEO_RULE_LABELS[rule] ?? REPORT_LABELS[rule] ?? '页面问题';
  if (!detail || detail.includes(rule)) return name;
  return `${name}：${detail}`;
}

/** 发布前四项。原因只用中文，不把规则 id 交给界面。 */
export function buildPreflight(input: PreflightInput): PreflightItem[] {
  const siteUrl = input.siteUrl.trim();
  const targetUrl = input.targetUrl.trim();
  let urlDetail = '和发布目标一致';
  let urlOk = true;
  let urlAction: PreflightItem['action'] = '';
  if (!targetUrl) {
    urlOk = false;
    urlDetail = '还没填发布后的站点网址';
    urlAction = 'settings';
  } else if (!siteUrl || placeholderUrl(siteUrl)) {
    urlOk = false;
    urlDetail = siteUrl ? `站点地址还是占位：${siteUrl}` : '还没填站点地址';
    urlAction = 'apply-url';
  } else if (!sameUrl(siteUrl, targetUrl)) {
    urlOk = false;
    urlDetail = `站点地址是 ${siteUrl}，发布目标是 ${targetUrl}`;
    urlAction = 'apply-url';
  }
  const url: PreflightItem = { key: 'url', ok: urlOk, label: '站点地址', detail: urlDetail, more: '', slug: '', action: urlAction };
  const workflow: PreflightItem = {
    key: 'workflow',
    ok: input.workflowReady,
    label: '构建配置',
    detail: input.workflowReady ? '构建配置已就绪' : '仓库里还没有构建配置',
    more: '',
    slug: '',
    action: '',
  };
  const explained = input.buildFailed ? explainLocalBuild(input.buildLog || input.buildMessage, input.postTitles ?? {}) : null;
  const recognized = explained !== null && explained.kind !== 'other';
  const build: PreflightItem = {
    key: 'build',
    ok: !input.buildFailed,
    label: '站点能构建',
    detail: !explained ? '构建通过' : recognized ? explained.summary : input.buildMessage || explained.summary || '构建没有通过',
    more: recognized && explained ? explained.detail : '',
    slug: recognized && explained ? explained.slug : '',
    action: !explained ? '' : recognized ? (explained.slug ? 'open-post' : '') : 'seo',
  };
  const seoErrors = input.buildFailed ? [] : input.errors.filter((item) => item.rule !== 'site-url-placeholder' && item.rule !== 'site-url-missing');
  const seo: PreflightItem = {
    key: 'seo',
    ok: !input.buildFailed && seoErrors.length === 0,
    label: 'SEO 没有错误',
    detail: input.buildFailed
      ? '构建没通过，还没有页面报告'
      : seoErrors.length
        ? seoErrors.slice(0, 5).map((item) => reason(item.rule, item.detail)).join('\n')
        : '没有错误',
    more: '',
    slug: '',
    action: !input.buildFailed && seoErrors.length ? 'seo' : '',
  };
  return [url, workflow, build, seo];
}
