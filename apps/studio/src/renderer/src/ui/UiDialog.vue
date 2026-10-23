<script lang="ts">
// 叠加的对话框共用一份栈，Esc 只关闭最上层那个。
const dialogStack: symbol[] = [];
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { mdiClose } from '@mdi/js';
import UiIcon from './UiIcon.vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    /** 面板宽度（px）。 */
    width?: number;
  }>(),
  { title: '', width: 420 },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

const instance = Symbol('ui-dialog');
const uid = useId();
const titleId = `${uid}-title`;
const panelRef = ref<HTMLElement | null>(null);
let lastActive: HTMLElement | null = null;
let savedOverflow: string | null = null;

function setOpen(value: boolean): void {
  if (props.modelValue === value) return;
  emit('update:modelValue', value);
  if (!value) emit('close');
}

function close(): void {
  setOpen(false);
}

function onVeilClick(): void {
  // 遮罩点击不关闭（防误触），但把焦点收回面板，避免焦点落到页面背后。
  panelRef.value?.focus();
}

function focusables(): HTMLElement[] {
  const panel = panelRef.value;
  if (!panel) return [];
  const nodes = panel.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );
  return Array.from(nodes).filter((node) => node.offsetParent !== null);
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (!props.modelValue) return;
  if (dialogStack[dialogStack.length - 1] !== instance) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    return;
  }
  if (event.key !== 'Tab') return;
  const list = focusables();
  if (list.length === 0) {
    event.preventDefault();
    panelRef.value?.focus();
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (
    !(active instanceof HTMLElement) ||
    !panelRef.value?.contains(active) ||
    active === panelRef.value
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(
  () => props.modelValue,
  async (value) => {
    if (value) {
      dialogStack.push(instance);
      lastActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onDocumentKeydown, true);
      await nextTick();
      const panel = panelRef.value;
      const preferred = panel?.querySelector<HTMLElement>('[autofocus]');
      (preferred ?? panel)?.focus();
    } else {
      const index = dialogStack.lastIndexOf(instance);
      if (index >= 0) dialogStack.splice(index, 1);
      document.removeEventListener('keydown', onDocumentKeydown, true);
      if (savedOverflow !== null) {
        document.body.style.overflow = savedOverflow;
        savedOverflow = null;
      }
      lastActive?.focus();
      lastActive = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  const index = dialogStack.lastIndexOf(instance);
  if (index >= 0) dialogStack.splice(index, 1);
  document.removeEventListener('keydown', onDocumentKeydown, true);
  if (savedOverflow !== null) {
    document.body.style.overflow = savedOverflow;
    savedOverflow = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-dialog">
      <div v-if="modelValue" class="ui-dialog">
        <div class="ui-dialog__veil" aria-hidden="true" @click="onVeilClick"></div>
        <div
          ref="panelRef"
          class="ui-dialog__panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          :style="{ width: `${width}px` }"
          tabindex="-1"
        >
          <header class="ui-dialog__head">
            <slot name="header">
              <h2 :id="titleId" class="ui-dialog__title">{{ title }}</h2>
            </slot>
            <button type="button" class="ui-dialog__close" aria-label="关闭" @click="close">
              <UiIcon :path="mdiClose" :size="16" />
            </button>
          </header>
          <div class="ui-dialog__body">
            <slot />
          </div>
          <footer v-if="$slots.actions" class="ui-dialog__foot">
            <slot name="actions" :close="close" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-dialog {
  position: fixed;
  inset: 0;
  z-index: var(--ui-z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ui-s6);
}

.ui-dialog__veil {
  position: absolute;
  inset: 0;
  background: var(--ui-bg);
  opacity: 0.72;
  backdrop-filter: blur(2px);
}

.ui-dialog__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-lg);
  background: var(--ui-panel);
  box-shadow: var(--ui-shadow-2);
  color: var(--ui-text);
  outline: none;
  transition: transform var(--ui-dur) var(--ui-ease);
}

.ui-dialog__head {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: 44px;
  padding: var(--ui-s2) var(--ui-s3) var(--ui-s2) var(--ui-s4);
  border-bottom: 1px solid var(--ui-line);
}

.ui-dialog__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: var(--ui-fs-3);
  font-weight: 600;
  line-height: var(--ui-lh);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-dialog__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--ui-h-sm);
  height: var(--ui-h-sm);
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  cursor: pointer;
}

.ui-dialog__close:hover {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.ui-dialog__close:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ui-dialog__body {
  flex: 1;
  min-height: 0;
  padding: var(--ui-s4);
  overflow: auto;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.ui-dialog__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-s2);
  padding: var(--ui-s3) var(--ui-s4);
  border-top: 1px solid var(--ui-line);
}

.ui-dialog-enter-active,
.ui-dialog-leave-active {
  transition: opacity var(--ui-dur) var(--ui-ease);
}

.ui-dialog-enter-from,
.ui-dialog-leave-to {
  opacity: 0;
}

.ui-dialog-enter-from .ui-dialog__panel,
.ui-dialog-leave-to .ui-dialog__panel {
  transform: translateY(6px) scale(0.98);
}
</style>
