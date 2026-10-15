import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.dirname(fileURLToPath(import.meta.url));
const exe = path.join(root, 'release', 'win-unpacked', 'XiaoSpike.exe');
const quit = path.join(root, '.shim', 'editor.quit');
mkdirSync(path.dirname(quit), { recursive: true });
rmSync(quit, { force: true });

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: false,
  args: ['--site', root, '--cmd', 'editor', '--quit-file', quit],
});

try {
  const pages = await browser.pages();
  let page = pages.find(
    (item) => item.url().includes('index.html') || item.url().startsWith('file:'),
  );
  const deadline = Date.now() + 20000;
  while (!page && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    page = (await browser.pages()).find((item) => !item.url().startsWith('devtools:'));
  }
  if (!page) throw new Error('没有找到编辑器页面');
  await page.waitForFunction('typeof window.__xiaoMonacoCheck === "function"', { timeout: 20000 });
  const result = await page.evaluate(async () => {
    const check = window.__xiaoMonacoCheck;
    if (!check) throw new Error('检查函数不存在');
    return check();
  });
  console.log(JSON.stringify(result, null, 2));
  const types = result.astroTypes.join(' ');
  if (!/keyword|storage/.test(types)) throw new Error(`astro 缺少关键字着色：${types}`);
  if (!/tag|entity\.name\.tag/.test(types)) throw new Error(`astro 缺少标签着色：${types}`);
  if (result.markdownTypes.length < 2) throw new Error('markdown 没有着色');
  if (!result.light || result.light === result.dark)
    throw new Error(`主题没有切换：${result.light} / ${result.dark}`);
  if (result.typescript < 1) throw new Error('TypeScript 没有补全');
  if (result.css < 1) throw new Error('CSS 没有补全');
  if (result.json < 1) throw new Error('JSON 没有补全');
  if (result.csp.length > 0) throw new Error(`CSP 报错：${result.csp.join(',')}`);
  console.log('MONACO_OK');
} finally {
  writeFileSync(quit, '1');
  await browser.close();
}
