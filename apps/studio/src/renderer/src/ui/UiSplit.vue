<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

type SplitDirection = 'horizontal' | 'vertical';

const props = withDefaults(
  defineProps<{
    direction?: SplitDirection;
    /** 第一块占容器尺寸的百分比（0–100）。 */
    modelValue: number;
    min?: number;
    max?: number;
    disabled?: boolean;
  }>(),
  { direction: 'horizontal', min: 10, max: 90, disabled: false },
);

const emit = defineEmits<{
  'update:modelValue': [value: number];
  dragstart: [];
  dragend: [];
}>();

const rootRef = ref<HTMLElement | null>(null);
const dragging = ref(false);

const bounds = computed(() => {
  const min = Math.min(props.min, props.max);
  const max = Math.max(props.min, props.max);
  return { min, max };
});

function clamp(percent: number): number {
  const { min, max } = bounds.value;
  return Math.min(max, Math.max(min, Math.round(percent * 10) / 10));
}

function commit(percent: number): void {
  const next = clamp(percent);
  if (next !== props.modelValue) emit('update:modelValue', next);
}

function resetDragState(): void {
  dragging.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

onBeforeUnmount(resetDragState);

function percentFromPointer(event: PointerEvent): number | null {
  const root = rootRef.value;
  if (!root) return null;
  const rect = root.getBoundingClientRect();
  if (props.direction === 'horizontal') {
    if (rect.width <= 0) return null;
    return ((event.clientX - rect.left) / rect.width) * 100;
  }
  if (rect.height <= 0) return null;
  return ((event.clientY - rect.top) / rect.height) * 100;
}

function onPointerDown(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return;
  const handle = event.currentTarget;
  if (!(handle instanceof HTMLElement)) return;
  event.preventDefault();
  dragging.value = true;
  handle.setPointerCapture(event.pointerId);
  // 拖拽期间锁住全局光标与选区，否则掠过 iframe/webview 时光标会闪回默认箭头。
  document.body.style.cursor = props.direction === 'horizontal' ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';
  emit('dragstart');
  const percent = percentFromPointer(event);
  if (percent !== null) commit(percent);
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return;
  const percent = percentFromPointer(event);
  if (percent !== null) commit(percent);
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return;
  const handle = event.currentTarget;
  if (handle instanceof HTMLElement && handle.hasPointerCapture(event.pointerId)) {
    handle.releasePointerCapture(event.pointerId);
  }
  resetDragState();
  emit('dragend');
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return;
  const step = event.shiftKey ? 10 : 2;
  const decrease = props.direction === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const increase = props.direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  if (event.key === decrease) {
    event.preventDefault();
    commit(props.modelValue - step);
    return;
  }
  if (event.key === increase) {
    event.preventDefault();
    commit(props.modelValue + step);
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    commit(bounds.value.min);
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    commit(bounds.value.max);
  }
}
</script>

<template>
  <div
    ref="rootRef"
    class="ui-split"
    :class="[`is-${direction}`, { 'is-dragging': dragging, 'is-disabled': disabled }]"
    :style="{ '--ui-split-size': `${modelValue}%` }"
  >
    <div class="ui-split__pane ui-split__first">
      <slot name="first" />
    </div>
    <div
      class="ui-split__handle"
      role="separator"
      tabindex="0"
      :aria-orientation="direction === 'horizontal' ? 'vertical' : 'horizontal'"
      :aria-valuenow="Math.round(modelValue)"
      :aria-valuemin="bounds.min"
      :aria-valuemax="bounds.max"
      aria-label="调整面板大小"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown="onKeydown"
    >
      <span class="ui-split__grip" aria-hidden="true"></span>
    </div>
    <div class="ui-split__pane ui-split__second">
      <slot name="second" />
    </div>
  </div>
</template>

<style scoped>
.ui-split {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.ui-split.is-horizontal {
  flex-direction: row;
}

.ui-split.is-vertical {
  flex-direction: column;
}

.ui-split__pane {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

.ui-split__first {
  flex: 0 0 var(--ui-split-size);
}

.ui-split__second {
  flex: 1 1 0;
}

.ui-split__handle {
  position: relative;
  display: flex;
  flex: 0 0 6px;
  align-items: center;
  justify-content: center;
  touch-action: none;
  outline: none;
  user-select: none;
}

.ui-split.is-horizontal .ui-split__handle {
  cursor: col-resize;
}

.ui-split.is-vertical .ui-split__handle {
  cursor: row-resize;
}

.ui-split__grip {
  border-radius: 1px;
  background: var(--ui-line);
  transition: background var(--ui-dur) var(--ui-ease);
}

.ui-split.is-horizontal .ui-split__grip {
  width: 2px;
  height: 24px;
}

.ui-split.is-vertical .ui-split__grip {
  width: 24px;
  height: 2px;
}

.ui-split__handle:hover .ui-split__grip,
.ui-split__handle:focus-visible .ui-split__grip,
.ui-split.is-dragging .ui-split__grip {
  background: var(--ui-accent);
}

.ui-split__handle:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.ui-split.is-dragging {
  user-select: none;
}

.ui-split.is-dragging::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: var(--ui-z-overlay);
}

.ui-split.is-disabled .ui-split__handle {
  cursor: default;
}

.ui-split.is-disabled .ui-split__grip {
  background: var(--ui-line);
}
</style>
