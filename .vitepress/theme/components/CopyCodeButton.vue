<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vitepress'

let cleanup: (() => void) | null = null

function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      resolve()
    } catch (e) {
      reject(e)
    } finally {
      ta.remove()
    }
  })
}

function install() {
  const pres = document.querySelectorAll<HTMLPreElement>('.post-prose pre')
  pres.forEach((pre) => {
    if (pre.querySelector('.x-copy-btn')) return
    const code = pre.querySelector('code')
    if (!code) return
    const btn = document.createElement('button')
    btn.className = 'x-copy-btn'
    btn.type = 'button'
    btn.setAttribute('aria-label', '复制代码')
    btn.textContent = '复制'
    btn.addEventListener('click', async () => {
      btn.textContent = '复制中…'
      try {
        await writeClipboard(code.textContent ?? '')
        btn.textContent = '已复制'
        btn.classList.add('x-copy-btn-done')
      } catch {
        btn.textContent = '复制失败'
      }
      setTimeout(() => {
        btn.textContent = '复制'
        btn.classList.remove('x-copy-btn-done')
      }, 1500)
    })
    pre.appendChild(btn)
  })
}

onMounted(() => {
  install()
  const router = useRouter()
  const unwatch = router.afterEach(() => {
    requestAnimationFrame(install)
  })
  cleanup = () => {
    unwatch?.()
  }
})

onBeforeUnmount(() => {
  cleanup?.()
})
</script>

<template>
  <div style="display: none"></div>
</template>
