import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { configFieldErrors, slugErrors } from '../src/lib/rules.mjs';
import { checkBuiltSite, htmlPostProblems } from '../src/lib/validate.mjs';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const missingUrl = configFieldErrors({
  version: 1,
  site: { base: '/', lang: 'zh-CN', title: '晓', description: '说明' },
  theme: { hue: 20 },
});
if (!missingUrl.includes('site.url')) throw new Error('坏配置没有指出 site.url');

const slugs = slugErrors(['Hello', 'hello', 'hello']);
if (
  !slugs.some((item) => item.includes('不合法')) ||
  !slugs.some((item) => item.includes('重复'))
) {
  throw new Error('slug 规则没有同时覆盖非法和重复');
}

const dir = mkdtempSync(path.join(tmpdir(), 'xiao-links-'));
mkdirSync(path.join(dir, 'about'), { recursive: true });
writeFileSync(path.join(dir, 'about', 'index.html'), '<a href="/missing">x</a>');
const dead = checkBuiltSite(dir);
rmSync(dir, { recursive: true, force: true });
if (!dead.some((item) => item.includes('/missing'))) throw new Error('死链没有被发现');

const quoted = mkdtempSync(path.join(tmpdir(), 'xiao-html-date-'));
mkdirSync(path.join(quoted, 'draft-html'), { recursive: true });
writeFileSync(
  path.join(quoted, 'draft-html', 'index.html'),
  '---\ntitle: "HTML 草稿"\ndate: "2026-11-18 00:00:00"\ndraft: "true"\nnoindex: "false"\nstandalone: "true"\n---\n<article><p>正文</p></article>\n',
);
const quotedOk = htmlPostProblems(quoted, ['draft-html']);
writeFileSync(
  path.join(quoted, 'draft-html', 'index.html'),
  '---\ntitle: "HTML 草稿"\ndate: "yesterday"\n---\n<p>x</p>\n',
);
const quotedBad = htmlPostProblems(quoted, ['draft-html']);
rmSync(quoted, { recursive: true, force: true });
if (quotedOk.length > 0) throw new Error(`带引号的日期不该失败：${quotedOk.join('；')}`);
if (!quotedBad.some((item) => item.includes('date 格式不对'))) {
  throw new Error('不合法的日期没有被拦住');
}

const configPath = path.join(root, 'xiao.config.json');
const original = readFileSync(configPath, 'utf8');
const broken = JSON.parse(original);
delete broken.site.url;
writeFileSync(configPath, JSON.stringify(broken, null, 2));
const build = spawnSync('pnpm exec astro build', { shell: true, encoding: 'utf8', cwd: root });
writeFileSync(configPath, original);
if (build.status === 0 || !`${build.stdout}\n${build.stderr}`.includes('site.url')) {
  throw new Error('改坏配置后构建没有报 site.url');
}

const custom = readFileSync(path.join(root, 'dist', 'posts', 'custom-note', 'index.html'), 'utf8');
const plain = readFileSync(path.join(root, 'dist', 'posts', 'hello', 'index.html'), 'utf8');
if (!custom.includes('自定义布局') || plain.includes('>自定义布局<')) {
  throw new Error('自定义布局分发不正确');
}
if (
  !plain.includes('--hue:250') ||
  !plain.includes('width=device-width') ||
  !plain.includes('BlogPosting')
) {
  throw new Error('主题或 SEO 标记缺失');
}

console.log('TEMPLATE_CHECKS_OK');
