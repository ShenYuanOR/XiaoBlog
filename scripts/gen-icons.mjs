import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const USED = [
  'tag', 'folder', 'calendar', 'moon-full', 'white-balance-sunny',
  'arrow-left', 'arrow-right', 'github', 'clock-outline',
  'book-open-page-variant', 'account-heart', 'heart', 'email',
]

const full = JSON.parse(readFileSync(resolve('node_modules/@iconify-json/mdi/icons.json'), 'utf-8'))
const icons = {}
for (const name of USED) {
  if (full.icons[name]) icons[name] = full.icons[name]
  else console.warn(`[gen-icons] 缺少图标: ${name}`)
}

writeFileSync(
  resolve('.vitepress/theme/mdi-subset.json'),
  JSON.stringify({
    prefix: full.prefix,
    // MDI path 坐标基于 24×24；缺省 width/height 会被 Iconify 当成 16 裁切
    width: full.width ?? 24,
    height: full.height ?? 24,
    icons,
  }),
)
console.log(`[gen-icons] 已生成 ${Object.keys(icons).length} 个图标 → .vitepress/theme/mdi-subset.json`)
