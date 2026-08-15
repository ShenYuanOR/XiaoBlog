<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const open = ref(false)
const src = ref('')
const alt = ref('')
const gallery = ref<string[]>([])
const index = ref(0)
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)

let startX = 0
let startY = 0
let startTx = 0
let startTy = 0

function resetTransform() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function openAt(img: HTMLImageElement) {
  const container = img.closest('.post-prose')
  const list = container
    ? [...container.querySelectorAll('img')].map((i) => (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src)
    : [(img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src]
  gallery.value = list
  index.value = Math.max(0, list.indexOf((img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src))
  src.value = list[index.value] ?? ''
  alt.value = img.alt
  resetTransform()
  open.value = true
  document.body.style.overflow = 'hidden'
}

function close() {
  open.value = false
  document.body.style.overflow = ''
}

function prev() {
  if (gallery.value.length < 2) return
  index.value = (index.value - 1 + gallery.value.length) % gallery.value.length
  src.value = gallery.value[index.value]
  resetTransform()
}

function next() {
  if (gallery.value.length < 2) return
  index.value = (index.value + 1) % gallery.value.length
  src.value = gallery.value[index.value]
  resetTransform()
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowLeft') prev()
  else if (e.key === 'ArrowRight') next()
}

function onWheel(e: WheelEvent) {
  if (!open.value) return
  e.preventDefault()
  const delta = e.deltaY < 0 ? 1.15 : 0.87
  scale.value = Math.min(8, Math.max(1, scale.value * delta))
}

function onPointerDown(e: PointerEvent) {
  if (scale.value <= 1) return
  dragging.value = true
  startX = e.clientX
  startY = e.clientY
  startTx = tx.value
  startTy = ty.value
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  tx.value = startTx + e.clientX - startX
  ty.value = startTy + e.clientY - startY
}

function stopDrag() {
  dragging.value = false
}

function onClickImage() {
  if (scale.value > 1) return
  if (gallery.value.length > 1) next()
  else close()
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG' && target.closest('.post-prose')) {
      openAt(target as HTMLImageElement)
    }
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="x-lightbox"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="stopDrag"
      @pointerleave="stopDrag"
    >
      <img
        :src="src"
        :alt="alt"
        class="x-lightbox-img"
        :style="{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }"
        @click.stop="onClickImage"
        @dblclick.stop="resetTransform"
      />
      <button class="x-lightbox-close" type="button" aria-label="关闭" @click.stop="close">×</button>
      <button v-if="gallery.length > 1" class="x-lightbox-nav x-lightbox-prev" type="button" aria-label="上一张" @click.stop="prev">‹</button>
      <button v-if="gallery.length > 1" class="x-lightbox-nav x-lightbox-next" type="button" aria-label="下一张" @click.stop="next">›</button>
      <div class="x-lightbox-hint">
        <span v-if="gallery.length > 1">{{ index + 1 }} / {{ gallery.length }} · </span>
        <span>滚轮缩放</span>
        <span v-if="scale > 1"> · 拖动平移</span>
        <span> · Esc 关闭</span>
      </div>
    </div>
  </Teleport>
</template>
