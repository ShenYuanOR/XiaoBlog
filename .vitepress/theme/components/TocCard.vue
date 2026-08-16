<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { getScrollOffset, useData } from 'vitepress'
import TocTree, { type TocNode } from './TocTree.vue'

/** VitePress page.headers 节点（可能已带 children 树） */
interface VpHeader {
  level: number
  title: string
  slug?: string
  link?: string
  children?: VpHeader[]
}

const { page } = useData()

const navEl = ref<HTMLElement | null>(null)
const activeLink = ref('')
const expanded = ref(new Set<string>())
const isClient = typeof window !== 'undefined'

function toSlug(h: VpHeader): string {
  if (h.slug) return h.slug
  if (h.link?.startsWith('#')) return decodeURIComponent(h.link.slice(1))
  return ''
}

/** 将 VitePress headers 树规范为 TocNode（兼容扁平/嵌套两种形态） */
function normalizeTree(headers: VpHeader[]): TocNode[] {
  // 若顶层已是嵌套树（带 children），直接映射
  const looksNested = headers.some((h) => Array.isArray(h.children) && h.children.length > 0)
  if (looksNested || headers.every((h) => h.level === headers[0]?.level)) {
    // 扁平但同级，或已是树：统一递归映射；扁平多级则再 stack 建树
    const hasMixedLevels = new Set(headers.map((h) => h.level)).size > 1
    if (!looksNested && hasMixedLevels) {
      return buildFromFlat(headers)
    }
    return headers
      .filter((h) => h.level >= 2 && toSlug(h))
      .map((h) => ({
        level: h.level,
        title: h.title,
        slug: toSlug(h),
        link: h.link?.startsWith('#') ? h.link : `#${toSlug(h)}`,
        children: normalizeTree(h.children ?? []),
      }))
  }
  return buildFromFlat(headers)
}

function buildFromFlat(flat: VpHeader[]): TocNode[] {
  const root: TocNode[] = []
  const stack: TocNode[] = []
  for (const h of flat) {
    const slug = toSlug(h)
    if (h.level < 2 || !slug) continue
    const node: TocNode = {
      level: h.level,
      title: h.title,
      slug,
      link: h.link?.startsWith('#') ? h.link : `#${slug}`,
      children: [],
    }
    while (stack.length && stack[stack.length - 1]!.level >= node.level) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.children.push(node)
    else root.push(node)
    stack.push(node)
  }
  return root
}

function countNodes(nodes: TocNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0)
}

const tree = computed(() => {
  const headers = (page.value.headers as VpHeader[] | undefined) ?? []
  return normalizeTree(headers)
})

const showToc = computed(() => countNodes(tree.value) >= 1)

function findPath(nodes: TocNode[], link: string, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...trail, n.link]
    if (n.link === link) return next
    const hit = findPath(n.children, link, next)
    if (hit) return hit
  }
  return null
}

function ensureExpanded(link: string) {
  const path = findPath(tree.value, link)
  if (!path || path.length <= 1) return
  const next = new Set(expanded.value)
  for (const p of path.slice(0, -1)) next.add(p)
  expanded.value = next
}

function toggleExpand(link: string, event: Event) {
  event.preventDefault()
  event.stopPropagation()
  const next = new Set(expanded.value)
  if (next.has(link)) next.delete(link)
  else next.add(link)
  expanded.value = next
}

function getAbsoluteTop(el: HTMLElement): number {
  let top = 0
  let cur: HTMLElement | null = el
  while (cur) {
    top += cur.offsetTop
    cur = cur.offsetParent as HTMLElement | null
  }
  return top
}

function collectAnchors(): { link: string; top: number }[] {
  const out: { link: string; top: number }[] = []
  const walk = (nodes: TocNode[]) => {
    for (const n of nodes) {
      const el = document.getElementById(decodeURIComponent(n.slug))
      if (el) {
        const top = getAbsoluteTop(el)
        if (!Number.isNaN(top)) out.push({ link: n.link, top })
      }
      if (n.children.length) walk(n.children)
    }
  }
  walk(tree.value)
  return out.sort((a, b) => a.top - b.top)
}

let anchors: { link: string; top: number }[] = []
let raf = 0

function scrollActiveIntoView() {
  nextTick(() => {
    const root = navEl.value
    if (!root || !activeLink.value) return
    const escaped = CSS.escape(activeLink.value)
    const a = root.querySelector<HTMLElement>(`a[href="${escaped}"]`)
    a?.scrollIntoView({ block: 'nearest' })
  })
}

function setActiveFromScroll() {
  if (!anchors.length) {
    activeLink.value = ''
    return
  }
  const scrollY = window.scrollY
  const offset = getScrollOffset() + 8
  const nearBottom = window.innerHeight + scrollY >= document.documentElement.scrollHeight - 2

  let current = anchors[0]!.link
  if (scrollY >= 8 && !nearBottom) {
    for (const a of anchors) {
      if (a.top > scrollY + offset) break
      current = a.link
    }
  } else if (nearBottom) {
    current = anchors[anchors.length - 1]!.link
  }

  if (activeLink.value !== current) {
    activeLink.value = current
    ensureExpanded(current)
    scrollActiveIntoView()
  }
}

function onScroll() {
  if (!isClient) return
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(setActiveFromScroll)
}

function refreshAnchors() {
  if (!isClient) return
  anchors = collectAnchors()
  setActiveFromScroll()
}

function resetExpandedForPage() {
  const next = new Set<string>()
  const walk = (nodes: TocNode[]) => {
    for (const n of nodes) {
      if (n.children.length) {
        next.add(n.link)
        walk(n.children)
      }
    }
  }
  walk(tree.value)
  expanded.value = next
}

function scheduleAnchorRefresh() {
  if (!isClient) return
  requestAnimationFrame(() => {
    refreshAnchors()
    requestAnimationFrame(refreshAnchors)
  })
}

watch(
  () => page.value.relativePath,
  async () => {
    activeLink.value = ''
    await nextTick()
    resetExpandedForPage()
    scheduleAnchorRefresh()
  },
  { immediate: true },
)

watch(tree, () => {
  resetExpandedForPage()
  scheduleAnchorRefresh()
})

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', refreshAnchors, { passive: true })
  refreshAnchors()
})

onUnmounted(() => {
  if (!isClient) return
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', refreshAnchors)
  cancelAnimationFrame(raf)
})

function onNavClick(event: MouseEvent) {
  const a = (event.target as HTMLElement).closest('a')
  if (!a?.hash) return
  const id = decodeURIComponent(a.hash.slice(1))
  document.getElementById(id)?.focus({ preventScroll: true })
}
</script>

<template>
  <div v-if="showToc" class="x-widget x-toc-card">
    <div class="x-widget-title">目录</div>
    <nav ref="navEl" class="x-toc" aria-label="文章目录" @click="onNavClick">
      <TocTree
        :nodes="tree"
        :active-link="activeLink"
        :expanded="expanded"
        @toggle="toggleExpand"
      />
    </nav>
  </div>
</template>
