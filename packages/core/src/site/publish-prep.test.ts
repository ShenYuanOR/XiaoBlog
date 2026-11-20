import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptToken,
  applyBuild,
  applyRepo,
  applySite,
  applyTokenReport,
  PREP_ORDER,
  blankPrep,
  canCreateRepo,
  newRepoPage,
  parseRepoUrl,
  stepPhase,
  stepTitle,
  suggestSite,
} from '../../../../apps/studio/src/main/publish-prep.ts';
import {
  enableGithubPages,
  interpretPagesCreate,
  interpretPagesRead,
  readCreatedRepo,
  interpretPublicRepo,
  readRemoteFacts,
  readRepoChoices,
} from '../../../../apps/studio/src/main/publish-remote.ts';
import { readGithubVerify, reuseTokenOn } from '../../../../apps/studio/src/main/publish-token.ts';
import { writeGithubWorkflow } from '../../../../apps/studio/src/main/publish-workflow.ts';

const classic = readGithubVerify({
  status: 200,
  scopes: null,
  expires: '',
  login: 'ShenYuanOR',
});

function reachedRepo() {
  return { ...blankPrep(), token: 'secret-token' };
}

describe('发布准备状态机', () => {
  it('GitHub 流程仍不复用进页验证，并且是先仓库的五步', () => {
    expect(PREP_ORDER).toEqual(['repo', 'token', 'site', 'build', 'publish']);
    expect(reuseTokenOn('page')).toBe(false);
    expect(reuseTokenOn('publish')).toBe(false);
    expect(reuseTokenOn('prep')).toBe(true);
  });

  it('六步都在，后面的只是名称', () => {
    const draft = blankPrep();
    expect(stepPhase(draft.step, 'repo', draft.done)).toBe('current');
    expect(stepPhase(draft.step, 'token', draft.done)).toBe('later');
    expect(stepPhase(draft.step, 'publish', draft.done)).toBe('later');
    expect(stepTitle('publish')).toBe('首次发布');
  });

  it('令牌验证：先展示结果，失效和不能推送停住，缺建仓库权限仍可继续', () => {
    let draft = applyRepo(reachedRepo(), {
      remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test',
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      branch: 'main',
      empty: true,
      xiao: false,
      isPrivate: false,
    });
    draft = { ...draft, token: 'secret-token' };
    const shown = applyTokenReport(draft, classic);
    expect(shown.step).toBe('token');
    expect(shown.report?.account).toBe('ShenYuanOR');
    expect(acceptToken(shown).step).toBe('site');
    const invalid = applyTokenReport(draft, readGithubVerify({ status: 401, scopes: null, expires: '', login: '' }));
    expect(invalid.step).toBe('token');
    expect(invalid.error).toBe('令牌已失效');
    expect(invalid.token).toBe('secret-token');
    expect(acceptToken(invalid).step).toBe('token');
    const fine = readGithubVerify({ status: 200, scopes: null, expires: '', login: 'a' });
    const noPush = applyTokenReport(draft, {
      ...fine,
      capabilities: fine.capabilities.map((item) => (item.key === 'push' ? { ...item, state: 'missing' as const } : item)),
    });
    expect(noPush.error).toContain('推送内容');
    expect(noPush.manualLink).toContain('personal-access-tokens/new');
    const base = readGithubVerify({ status: 200, scopes: null, expires: '', login: 'a' });
    const noCreateReport = {
      ...base,
      capabilities: base.capabilities.map((item) => (item.key === 'create' ? { ...item, state: 'missing' as const } : item)),
    };
    const noCreate = acceptToken(applyTokenReport(draft, noCreateReport));
    expect(noCreate.step).toBe('site');
    expect(canCreateRepo(noCreate.report)).toBe(false);
    expect(canCreateRepo(classic)).toBe(false);
  });

  it('仓库：空仓库继续，非晓站点要确认，确认后地址还在', () => {
    const draft = reachedRepo();
    const empty = applyRepo(draft, {
      remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test',
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      branch: 'main',
      empty: true,
      xiao: false,
      isPrivate: false,
    });
    expect(empty.step).toBe('token');
    const foreign = applyRepo(draft, {
      remoteUrl: 'https://github.com/ShenYuanOR/notes',
      owner: 'ShenYuanOR',
      repo: 'notes',
      branch: 'main',
      empty: false,
      xiao: false,
      isPrivate: false,
    });
    expect(foreign.step).toBe('repo');
    expect(foreign.error).toContain('已有别的内容');
    expect(foreign.error).toContain('覆盖会丢掉');
    expect(foreign.token).toBe('secret-token');
    const confirmed = applyRepo(foreign, {
      remoteUrl: foreign.remoteUrl,
      owner: foreign.owner,
      repo: foreign.repo,
      branch: foreign.branch,
      empty: false,
      xiao: false,
      isPrivate: false,
      confirmed: true,
    });
    expect(confirmed.step).toBe('token');
    expect(confirmed.remoteUrl).toContain('notes');
    const priv = applyRepo(draft, {
      remoteUrl: 'https://github.com/ShenYuanOR/secret',
      owner: 'ShenYuanOR',
      repo: 'secret',
      branch: 'main',
      empty: true,
      xiao: false,
      isPrivate: true,
    });
    expect(priv.step).toBe('repo');
    expect(priv.error).toContain('免费套餐只有公开仓库能用 Pages');
  });

  it('网站地址：GitHub 自动算，根路径和子路径都对，Gitea 没填就停', () => {
    let draft = applyRepo(reachedRepo(), {
      remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test',
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      branch: 'main',
      empty: true,
      xiao: false,
      isPrivate: false,
    });
    expect(suggestSite(draft)).toEqual({
      siteUrl: 'https://shenyuanor.github.io/xiao-pages-test/',
      base: '/xiao-pages-test/',
      needHost: false,
    });
    const root = suggestSite({ ...draft, repo: 'ShenYuanOR.github.io' });
    expect(root).toEqual({ siteUrl: 'https://shenyuanor.github.io/', base: '/', needHost: false });
    const saved = applySite(draft, root.siteUrl ? suggestSite(draft) : { siteUrl: '', base: '' });
    expect(saved.step).toBe('build');
    expect(saved.token).toBe('secret-token');
  });

  it('构建准备：自动完成进入发布，做不到就停住且仓库还在', () => {
    let draft = applySite(
      applyRepo(reachedRepo(), {
        remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test',
        owner: 'ShenYuanOR',
        repo: 'xiao-pages-test',
        branch: 'main',
        empty: true,
        xiao: false,
        isPrivate: false,
      }),
      { siteUrl: 'https://shenyuanor.github.io/xiao-pages-test/', base: '/xiao-pages-test/' },
    );
    const manual = applyBuild(draft, {
      workflow: 'ok',
      hosting: 'manual',
      runner: 'idle',
      error: '这个令牌开不了 Pages。',
      next: '做完后点「我已完成，重新检查」。',
      link: 'https://github.com/ShenYuanOR/xiao-pages-test/settings/pages',
    });
    expect(manual.step).toBe('build');
    expect(manual.remoteUrl).toContain('xiao-pages-test');
    expect(manual.token).toBe('secret-token');
    expect(manual.manualLink).toContain('/settings/pages');
    const ready = applyBuild(manual, { workflow: 'ok', hosting: 'ok', runner: 'idle' });
    expect(ready.step).toBe('publish');
    expect(ready.siteUrl).toContain('github.io');
    const runner = applyBuild(draft, {
      workflow: 'ok',
      hosting: 'ok',
      runner: 'warn',
      error: '没有在线的构建机。',
      next: '准备好构建机后点「我已完成，重新检查」。',
    });
    expect(runner.step).toBe('build');
    expect(runner.owner).toBe('ShenYuanOR');
  });

  it('网址和新建链接', () => {
    const draft = { ...reachedRepo(), report: classic };
    expect(parseRepoUrl('https://github.com/ShenYuanOR/xiao-pages-test.git')?.remoteUrl).toBe(
      'https://github.com/ShenYuanOR/xiao-pages-test',
    );
    expect(parseRepoUrl('ShenYuan/xiao-gate', 'http://192.168.1.170:3000')?.remoteUrl).toBe(
      'http://192.168.1.170:3000/ShenYuan/xiao-gate',
    );
    expect(newRepoPage(draft, 'xiao-pages-test')).toContain('owner=ShenYuanOR');
    expect(newRepoPage(draft, 'xiao-pages-test')).toContain('visibility=public');
  });
});

describe('准备用的远端判断', () => {
  it('仓库列表、Pages 状态、静态服务和建仓库失败', async () => {
    const repos = readRepoChoices('https://github.com', [
      { full_name: 'ShenYuanOR/xiao-pages-test', private: false, size: 0, default_branch: 'main' },
      { full_name: 'ShenYuanOR/notes', private: true, size: 12, default_branch: 'main' },
    ]);
    expect(repos[0]).toMatchObject({ empty: true, private: false });
    expect(repos[1]).toMatchObject({ empty: false, private: true });
    expect(interpretPagesCreate(201)).toBe('ok');
    expect(interpretPagesCreate(403)).toBe('manual');
    expect(interpretPagesRead(200, 'workflow')).toBe('ok');
    expect(interpretPagesRead(200, 'legacy')).toBe('update');
    expect(readCreatedRepo(403, {}).message).toContain('不能新建仓库');
    const missing = interpretPublicRepo({
      owner: 'ShenYuanOR',
      repo: 'not-there',
      remoteUrl: 'https://github.com/ShenYuanOR/not-there',
      repoStatus: 404,
      repoBody: {},
      commitsStatus: 404,
      configStatus: 404,
    });
    expect(missing.found).toBe(false);
    expect(missing.message).toContain('没找到');
    const empty = interpretPublicRepo({
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      remoteUrl: 'https://github.com/ShenYuanOR/xiao-pages-test',
      repoStatus: 200,
      repoBody: { private: false, default_branch: 'main' },
      commitsStatus: 409,
      configStatus: 404,
    });
    expect(empty).toMatchObject({ found: true, empty: true, isPrivate: false, xiao: false, branch: 'main' });
  });

  it('xiao-pages-test：公开、空、main，Pages 未开启', async () => {
    const remoteUrl = 'https://github.com/ShenYuanOR/xiao-pages-test';
    const listed = readRepoChoices('https://github.com', [
      { full_name: 'ShenYuanOR/xiao-pages-test', private: false, size: 0, default_branch: 'main', clone_url: `${remoteUrl}.git` },
    ]);
    expect(listed[0]).toMatchObject({
      owner: 'ShenYuanOR',
      name: 'xiao-pages-test',
      private: false,
      empty: true,
      branch: 'main',
      url: remoteUrl,
    });
    const facts = await readRemoteFacts({
      remoteUrl,
      token: 'token',
      fetchImpl: (async (url: string) => {
        if (url.endsWith('/contents/xiao.config.json')) return new Response('', { status: 404 });
        return new Response(JSON.stringify({ private: false, size: 0, default_branch: 'main' }), { status: 200 });
      }) as typeof fetch,
    });
    expect(facts).toMatchObject({
      ok: true,
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      branch: 'main',
      empty: true,
      xiao: false,
      isPrivate: false,
    });
    const picked = applyRepo(reachedRepo(), {
      remoteUrl,
      owner: 'ShenYuanOR',
      repo: 'xiao-pages-test',
      branch: 'main',
      empty: true,
      xiao: false,
      isPrivate: false,
    });
    expect(picked.step).toBe('token');
    expect(suggestSite(picked)).toEqual({
      siteUrl: 'https://shenyuanor.github.io/xiao-pages-test/',
      base: '/xiao-pages-test/',
      needHost: false,
    });
    const pages = await enableGithubPages(
      'ShenYuanOR',
      'xiao-pages-test',
      'token',
      (async () => new Response('', { status: 404 })) as typeof fetch,
    );
    expect(pages.state).toBe('manual');
    expect(pages.link).toBe('https://github.com/ShenYuanOR/xiao-pages-test/settings/pages');
  });

  it('开不了 Pages 时给出设置页', async () => {
    const result = await enableGithubPages(
      'ShenYuanOR',
      'xiao-pages-test',
      'token',
      (async () => new Response('', { status: 403 })) as typeof fetch,
    );
    expect(result.state).toBe('manual');
    expect(result.detail).toContain('Settings → Pages');
    expect(result.link).toBe('https://github.com/ShenYuanOR/xiao-pages-test/settings/pages');
  });

  it('已是 workflow 时不发写请求，重新检查也只读', async () => {
    const methods: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      methods.push((init?.method ?? 'GET').toUpperCase());
      return new Response(JSON.stringify({ build_type: 'workflow' }), { status: 200 });
    }) as typeof fetch;
    const ready = await enableGithubPages('ShenYuanOR', 'xiao-pages-test', 'token', fetchImpl);
    expect(ready.state).toBe('ok');
    expect(ready.detail).toContain('workflow');
    expect(methods).toEqual(['GET']);
    methods.length = 0;
    const again = await enableGithubPages('ShenYuanOR', 'xiao-pages-test', 'token', fetchImpl, { recheck: true });
    expect(again.state).toBe('ok');
    expect(methods).toEqual(['GET']);
    const missedMethods: string[] = [];
    const missed = await enableGithubPages(
      'ShenYuanOR',
      'xiao-pages-test',
      'token',
      (async (_url: string, init?: RequestInit) => {
        missedMethods.push((init?.method ?? 'GET').toUpperCase());
        return new Response('', { status: 404 });
      }) as typeof fetch,
      { recheck: true },
    );
    expect(missed.state).toBe('manual');
    expect(missedMethods).toEqual(['GET']);
    const createdMethods: string[] = [];
    const created = await enableGithubPages(
      'ShenYuanOR',
      'xiao-pages-test',
      'token',
      (async (_url: string, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        createdMethods.push(method);
        if (method === 'GET') return new Response('', { status: 404 });
        return new Response('', { status: 403 });
      }) as typeof fetch,
    );
    expect(created.state).toBe('manual');
    expect(createdMethods).toEqual(['GET', 'POST']);
  });

  it('GitHub 构建配置带上提交号', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xiao-workflow-'));
    try {
      expect(writeGithubWorkflow(dir, 'main')).toBe('written');
      const text = readFileSync(join(dir, '.github/workflows/xiao-deploy.yml'), 'utf8');
      expect(text).toContain('XIAO_BUILD_SHA: ${{ github.sha }}');
      expect(writeGithubWorkflow(dir, 'main')).toBe('kept');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
