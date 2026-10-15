import puppeteer from 'puppeteer-core';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: false,
  args: ['--disable-gpu'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.goto('http://127.0.0.1:4488/roundtrip.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__xiaoCrepeSummary', { timeout: 180000 });
  const summary = await page.evaluate(() => window.__xiaoCrepeSummary);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary || summary.total < 20) throw new Error('语料不足');
  if (summary.same !== summary.total) throw new Error(`零 diff 未全部通过：${summary.same}/${summary.total}`);
  if (!summary.latency?.changed) throw new Error('按键没有进入文档');
  console.log('CREPE_OK');
} finally {
  await browser.close();
}
