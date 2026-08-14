import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const USED = [
  'home', 'tag', 'folder', 'calendar', 'moon-full', 'white-balance-sunny',
  'arrow-left', 'arrow-right', 'eye', 'github', 'clock-outline',
]

const full = JSON.parse(readFileSync(resolve('node_modules/@iconify-json/mdi/icons.json'), 'utf-8'))
const icons = {}
for (const name of USED) {
  if (full.icons[name]) icons[name] = full.icons[name]
  else console.warn(`[gen-icons] 缺少图标: ${name}`)
}

writeFileSync(
  resolve('.vitepress/theme/mdi-subset.json'),
  JSON.stringify({ prefix: full.prefix, icons }),
)
console.log(`[gen-icons] 已生成 ${Object.keys(icons).length} 个图标 → .vitepress/theme/mdi-subset.json`)
