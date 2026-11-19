import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deployWorkflow,
  guides,
  pagesSettingsUrl,
  parseRepo,
  readPages,
  readRepoCheck,
  siteBase,
  tokenUrl,
} from '../../../../apps/studio/src/main/wizard.ts';
import { writeDeployFiles } from '../../../../apps/studio/src/main/deploy-files.ts';

describe('部署向导', () => {
  it('解析链接、base 和三张引导', () => {
    expect(parseRepo('https://github.com/Owner/Blog.git')).toEqual({
      owner: 'Owner',
      repo: 'Blog',
    });
    expect(parseRepo('git@github.com:Owner/Blog.git')).toEqual({ owner: 'Owner', repo: 'Blog' });
    expect(parseRepo('不是链接')).toBeNull();
    expect(siteBase('Owner', 'Owner.github.io')).toBe('/');
    expect(siteBase('Owner', 'Blog')).toBe('/Blog/');
    expect(deployWorkflow('main')).toContain('XIAO_BUILD_SHA: ${{ github.sha }}');
    expect(guides.map((item) => item.id)).toEqual(['repo', 'token', 'pages']);
    expect(tokenUrl).not.toContain('target_name');
    expect(pagesSettingsUrl('Owner', 'Blog')).toBe('https://github.com/Owner/Blog/settings/pages');
  });

  it('假响应能区分权限、私有仓库和 Pages', () => {
    expect(readRepoCheck(403, '{}', 'contents, workflows').message).toContain(
      'contents, workflows',
    );
    expect(
      readRepoCheck(200, '{"private":true,"default_branch":"master"}', null).message,
    ).toContain('私有');
    expect(readRepoCheck(200, '{"private":false,"default_branch":"master"}', null)).toMatchObject({
      ok: true,
      branch: 'master',
    });
    expect(readPages(404, '{}').ready).toBe(false);
    expect(readPages(200, '{"build_type":"legacy"}').ready).toBe(false);
    expect(
      readPages(200, '{"build_type":"workflow","html_url":"https://example.test/blog/"}'),
    ).toMatchObject({
      ready: true,
      htmlUrl: 'https://example.test/blog/',
    });
  });

  it('配置只写本地文件，不推送', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'xiao-wizard-'));
    writeFileSync(
      path.join(site, 'xiao.config.json'),
      `${JSON.stringify({ version: 1, site: { url: 'https://example.com', base: '/' } })}\n`,
    );
    mkdirSync(path.join(site, '.github', 'workflows'), { recursive: true });
    writeDeployFiles(site, {
      owner: 'Owner',
      repo: 'Blog',
      branch: 'master',
      url: 'https://owner.github.io/Blog',
    });
    const config = JSON.parse(readFileSync(path.join(site, 'xiao.config.json'), 'utf8')) as {
      site: { url: string; base: string };
      deploy: { repo: string; branch: string };
    };
    expect(config.site.base).toBe('/Blog/');
    expect(config.deploy).toEqual({ repo: 'Owner/Blog', branch: 'master' });
    expect(readFileSync(path.join(site, '.github/workflows/deploy.yml'), 'utf8')).toBe(
      deployWorkflow('master'),
    );
    expect(readFileSync(path.join(site, 'xiao.config.json'), 'utf8')).not.toContain(
      'local-fake-token',
    );
  });
});
