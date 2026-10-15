import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(import.meta.dirname, '../../..');
const template = path.join(repo, 'packages', 'template');
const demo = path.join(repo, 'examples', 'demo');
const { apply, scan } = await import(
  pathToFileURL(path.join(repo, 'packages', 'core', 'src', 'importer', 'index.ts')).href
);

rmSync(demo, { recursive: true, force: true });
mkdirSync(demo, { recursive: true });
cpSync(template, demo, {
  recursive: true,
  filter: (source) => {
    const rel = path.relative(template, source);
    if (!rel) return true;
    const top = rel.split(path.sep)[0];
    return !['node_modules', 'dist', '.astro'].includes(top);
  },
});
rmSync(path.join(demo, 'src', 'content', 'posts'), { recursive: true, force: true });
mkdirSync(path.join(demo, 'src', 'content', 'posts'), { recursive: true });

const pkgPath = path.join(demo, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = 'demo';
delete pkg.dependencies?.shiki;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const configPath = path.join(demo, 'xiao.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.site.url = 'https://shenyuanor.github.io';
config.site.base = '/XiaoBlog/';
config.site.subtitle = '一个安静的个人内容站';
config.site.description = '「晓」框架的个人博客与开发文档，记录技术、生活与思考。';
config.author = {
  name: 'Shen Yuan',
  avatar: '/avatar.svg',
  bio: '一个安静写代码的人。',
  email: '',
};
config.social = [{ name: 'GitHub', icon: 'github', url: 'https://github.com/ShenYuanOL' }];
config.redirects = {};
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const avatar = spawnSync(
  'git',
  ['-c', 'core.autocrlf=false', 'show', 'v1-vitepress:public/avatar.svg'],
  { cwd: repo, encoding: 'buffer' },
);
if (avatar.status !== 0) throw new Error('取不到 1.x 头像');
writeFileSync(path.join(demo, 'public', 'avatar.svg'), avatar.stdout);

const cardDemo = path.join(demo, 'src', 'pages', 'xiao', '[name].astro');
writeFileSync(
  cardDemo,
  readFileSync(cardDemo, 'utf8').replace('slug="hello"', 'slug="hello-xiao"'),
);

const postsDir = path.join(repo, 'packages', 'core', 'src', 'markdown', 'corpus', 'posts');
const report = scan({ name: 'xiao', postsDir });
const applied = apply(report, {
  contentDir: path.join(demo, 'src', 'content', 'posts'),
  configPath,
});
console.log(
  `DEMO_APPLIED posts=${applied.written.length} images=${applied.imagesCopied} redirects=${applied.redirectsAdded}`,
);
