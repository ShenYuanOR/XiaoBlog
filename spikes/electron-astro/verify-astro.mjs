import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const spikeRoot = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(spikeRoot, 'site');
const electron = path.join(spikeRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const postPath = path.join(siteRoot, 'src', 'content', 'posts', 'big', 'index.md');
const originalPost = readFileSync(postPath, 'utf8');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(electron, args, {
      cwd: siteRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ASTRO_TELEMETRY_DISABLED: '1',
        HTTP_PROXY: 'http://127.0.0.1:9',
        HTTPS_PROXY: 'http://127.0.0.1:9',
        ALL_PROXY: 'http://127.0.0.1:9',
        http_proxy: 'http://127.0.0.1:9',
        https_proxy: 'http://127.0.0.1:9',
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('exit', (code) => resolve({ code: code ?? 1, output }));
  });
}

function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      let name = decodeURIComponent(url.pathname);
      if (name.startsWith('/demo/')) name = name.slice('/demo'.length);
      else if (name === '/demo') name = '/';
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(dir, `.${name}`);
      const relative = path.relative(dir, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        response.writeHead(403);
        response.end();
        return;
      }
      try {
        const body = readFileSync(file);
        const type = file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.xml')
            ? 'application/xml'
            : 'text/html';
        response.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end();
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: typeof address === 'object' && address ? address.port : 0 });
    });
  });
}

writeFileSync(postPath, '---\ntitle: 123\n---\n\n# 坏的前言\n');
let schema;
try {
  schema = await run(['node_modules/astro/bin/astro.mjs', 'build']);
} finally {
  writeFileSync(postPath, originalPost);
}
if (schema.code === 0) throw new Error('写错的 frontmatter 仍构建成功');

const built = await run(['node_modules/astro/bin/astro.mjs', 'build']);
if (built.code !== 0) throw new Error('正常构建失败');
const indexed = await run(['node_modules/pagefind/lib/runner/bin.cjs', '--site', 'dist']);
if (indexed.code !== 0) throw new Error('Pagefind 索引失败');

const dist = path.join(siteRoot, 'dist');
const sitemap = readFileSync(path.join(dist, 'sitemap-0.xml'), 'utf8');
const feed = readFileSync(path.join(dist, 'rss.xml'), 'utf8');
const home = readFileSync(path.join(dist, 'index.html'), 'utf8');
const { server, port } = await serve(dist);
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
let search;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`http://127.0.0.1:${port}/demo/note/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('document.documentElement.dataset.hits');
  search = await page.evaluate(() => ({
    hits: document.documentElement.dataset.hits,
    hit: document.documentElement.dataset.hit,
  }));
} finally {
  await browser.close();
  server.close();
}

const summary = {
  schemaFailed: schema.code !== 0,
  schemaExcerpt: schema.output
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .filter((line) => line.trim())
    .slice(-12),
  sitemapHasDemo: sitemap.includes('https://spike.example/demo/'),
  rssHasDemo: feed.includes('/demo/'),
  homeLink: home.includes('/demo/note/'),
  search,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.schemaFailed || !summary.sitemapHasDemo || !summary.rssHasDemo || !summary.homeLink) {
  throw new Error('sitemap、RSS 或链接检查未通过');
}
if (!search.hits || search.hits === '0' || !String(search.hit).includes('/demo/')) {
  throw new Error('中文搜索或子路径未命中');
}
console.log('ASTRO_OK');
