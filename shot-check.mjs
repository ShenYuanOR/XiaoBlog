import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1440,1200'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1200 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

// 首页
await page.goto('http://localhost:5299/', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 500))
await page.screenshot({ path: '/tmp/shot-home.png', fullPage: false })
const homeInfo = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length
  return {
    icons: document.querySelectorAll('svg path').length,
    cards: q('.x-post-card'),
    hero: !!document.querySelector('.x-home-hero'),
    heroAvatar: !!document.querySelector('.x-home-hero-avatar'),
    sidebarWidgets: q('.x-sidebar .x-widget'),
    mainCol: document.querySelector('.x-main-col')?.getBoundingClientRect().width,
    sideCol: document.querySelector('.x-side-col')?.getBoundingClientRect().width,
    h1s: q('h1'),
  }
})

// 文章页
await page.goto('http://localhost:5299/posts/hello-xiao', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 500))
const postInfo = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length
  return {
    icons: document.querySelectorAll('svg path').length,
    h1s: q('h1'),
    toc: q('.x-toc a'),
    mainCol: document.querySelector('.x-main-col')?.getBoundingClientRect().width,
    sideCol: document.querySelector('.x-side-col')?.getBoundingClientRect().width,
    prose: !!document.querySelector('.post-prose'),
  }
})

console.log('HOME:', JSON.stringify(homeInfo))
console.log('POST:', JSON.stringify(postInfo))
console.log('JS-ERRORS:', JSON.stringify(errors))
await browser.close()
