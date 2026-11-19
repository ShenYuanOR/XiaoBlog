import { SEO_RULE_LABELS, placeholderUrl } from './seo.ts';

export interface PreflightItem {
  key: 'url' | 'workflow' | 'build' | 'seo';
  ok: boolean;
  label: string;
  detail: string;
  action: '' | 'seo' | 'settings' | 'apply-url';
}

export interface PreflightInput {
  siteUrl: string;
  targetUrl: string;
  workflowReady: boolean;
  buildFailed: boolean;
  buildMessage: string;
  errors: { rule: string; detail: string }[];
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
  const url: PreflightItem = { key: 'url', ok: urlOk, label: '站点地址', detail: urlDetail, action: urlAction };
  const workflow: PreflightItem = {
    key: 'workflow',
    ok: input.workflowReady,
    label: '构建配置',
    detail: input.workflowReady ? '构建配置已就绪' : '仓库里还没有构建配置',
    action: '',
  };
  const build: PreflightItem = {
    key: 'build',
    ok: !input.buildFailed,
    label: '站点能构建',
    detail: input.buildFailed ? input.buildMessage || '构建没有通过' : '构建通过',
    action: input.buildFailed ? 'seo' : '',
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
    action: !input.buildFailed && seoErrors.length ? 'seo' : '',
  };
  return [url, workflow, build, seo];
}
