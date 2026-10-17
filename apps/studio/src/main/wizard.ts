export const tokenUrl =
  'https://github.com/settings/personal-access-tokens/new?name=XiaoBlog+Publish&description=XiaoBlog+Studio%3A+push+site+and+watch+Actions.+Select+ONLY+your+blog+repository.&expires_in=90&contents=write&workflows=write&pages=read&actions=read';

export const guides = [
  {
    id: 'repo',
    title: '建一个公开的空仓库',
    href: 'https://github.com/new',
    doc: 'https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository',
    image: '01-repo.svg',
    text: '不要勾 README、LICENSE 或 .gitignore。建好后复制仓库链接。',
  },
  {
    id: 'token',
    title: '只给这一个仓库发 Token',
    href: tokenUrl,
    doc: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
    image: '02-token.svg',
    text: '资源只选当前博客仓库。Token 只留在本机加密存储里，不会写进站点文件。',
  },
  {
    id: 'pages',
    title: '把 Pages 源设成 GitHub Actions',
    href: '',
    doc: 'https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site',
    image: '03-pages.svg',
    text: '仓库 Settings → Pages → Source 选 GitHub Actions。',
  },
] as const;

export function parseRepo(input: string): { owner: string; repo: string } | null {
  const text = input.trim().replace(/\.git$/, '');
  const ssh = /^git@github\.com:([^/\s]+)\/([^/\s]+)$/.exec(text);
  if (ssh?.[1] && ssh[2]) return { owner: ssh[1], repo: ssh[2] };
  const web = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)$/.exec(text);
  if (web?.[1] && web[2]) return { owner: web[1], repo: web[2] };
  const short = /^([^/\s]+)\/([^/\s]+)$/.exec(text);
  if (short?.[1] && short[2]) return { owner: short[1], repo: short[2] };
  return null;
}

export function siteBase(owner: string, repo: string): string {
  if (repo.toLowerCase() === `${owner.toLowerCase()}.github.io`) return '/';
  return `/${repo}/`;
}

export function pagesSettingsUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}/settings/pages`;
}

export function readRepoCheck(
  status: number,
  body: string,
  permissionHeader: string | null,
): { ok: boolean; message: string; branch: string } {
  if (status === 403) {
    const missing = permissionHeader?.trim() || '未知权限';
    return { ok: false, message: `Token 缺权限：${missing}`, branch: '' };
  }
  const parsed = JSON.parse(body) as { private?: boolean; default_branch?: string };
  if (parsed.private) {
    return { ok: false, message: '免费账户的私有仓库不能用 GitHub Pages', branch: '' };
  }
  return {
    ok: status === 200,
    message: status === 200 ? '' : `仓库检查失败 ${status}`,
    branch: parsed.default_branch ?? 'master',
  };
}

export function readPages(status: number, body: string): { ready: boolean; htmlUrl: string } {
  if (status === 404) return { ready: false, htmlUrl: '' };
  const parsed = JSON.parse(body) as { build_type?: string; html_url?: string };
  return {
    ready: parsed.build_type === 'workflow',
    htmlUrl: parsed.html_url ?? '',
  };
}

export function deployWorkflow(branch: string): string {
  return [
    'name: Deploy to GitHub Pages',
    'on:',
    '  push:',
    `    branches: [${branch}]`,
    '  workflow_dispatch:',
    'permissions:',
    '  contents: read',
    '  pages: write',
    '  id-token: write',
    'concurrency:',
    '  group: pages',
    '  cancel-in-progress: false',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v7',
    '      - uses: withastro/action@v6',
    '  deploy:',
    '    needs: build',
    '    runs-on: ubuntu-latest',
    '    environment:',
    '      name: github-pages',
    '      url: ${{ steps.deployment.outputs.page_url }}',
    '    steps:',
    '      - id: deployment',
    '        uses: actions/deploy-pages@v5',
    '',
  ].join('\n');
}
