import { loadPosts } from '../.vitepress/engine/posts.ts'
import { validatePosts, validateBuild } from '../.vitepress/engine/validate.ts'
import { buildAutoPagesData, autoPageRoutes } from '../.vitepress/engine/automata.ts'

const posts = loadPosts()
const issues = [...validatePosts(posts)]
const routes = ['/', ...autoPageRoutes(), ...posts.filter((p) => !p.frontmatter.draft && !p.frontmatter.noindex).map((p) => p.route)]
issues.push(...validateBuild('.vitepress/dist', routes, posts))
buildAutoPagesData()

if (issues.length > 0) {
  for (const i of issues) {
    console.log(`[${i.level}] ${i.message}`)
  }
  process.exitCode = issues.some((i) => i.level === 'error') ? 1 : 0
} else {
  console.log('「晓」校验通过')
}
