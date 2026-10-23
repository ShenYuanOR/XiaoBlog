<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { CSSProperties } from 'vue';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

const props = withDefaults(
  defineProps<{
    label: string;
    placement?: TooltipPlacement;
    /** 悬停多久后出现（ms）。 */
    delay?: number;
    disabled?: boolean;
  }>(),
  { placement: 'top', delay: 120, disabled: false },
);

const uid = useId();
const tipId = `${uid}-tip`;
const triggerRef = ref<HTMLElement | null>(null);
const tipRef = ref<HTMLElement | null>(null);
const visible = ref(false);
const position = ref<CSSProperties>({ position: 'fixed', top: '0px', left: '0px', visibility: 'hidden' });

let showTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
}

async function place(): Promise<void> {
  const trigger = triggerRef.value;
  if (!trigger) return;
  await nextTick();
  const tip = tipRef.value;
  if (!tip) return;
  const rect = trigger.getBoundingClientRect();
  const tipWidth = tip.offsetWidth;
  const tipHeight = tip.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8;
  const gap = 6;
  let left = rect.left + rect.width / 2 - tipWidth / 2;
  let top = rect.top - tipHeight - gap;
  if (props.placement === 'bottom') top = rect.bottom + gap;
  else if (props.placement === 'left') {
    left = rect.left - tipWidth - gap;
    top = rect.top + rect.height / 2 - tipHeight / 2;
  } else if (props.placement === 'right') {
    left = rect.right + gap;
    top = rect.top + rect.height / 2 - tipHeight / 2;
  }
  left = Math.min(Math.max(margin, left), Math.max(margin, viewportWidth - tipWidth - margin));
  top = Math.min(Math.max(margin, top), Math.max(margin, viewportHeight - tipHeight - margin));
  position.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    visibility: 'visible',
  };
}

function show(): void {
  if (props.disabled || !props.label) return;
  clearTimer();
  showTimer = setTimeout(() => {
    showTimer = null;
    visible.value = true;
  }, props.delay);
}

function hide(): void {
  clearTimer();
  if (visible.value) visible.value = false;
}

function onScroll(): void {
  hide();
}

watch(visible, async (value) => {
  if (value) {
    window.addEventListener('scroll', onScroll, true);
    await place();
  } else {
    window.removeEventListener('scroll', onScroll, true);
  }
});

onBeforeUnmount(() => {
  clearTimer();
  window.removeEventListener('scroll', onScroll, true);
});
</script>

<template>
  <span
    ref="triggerRef"
    class="ui-tooltip__trigger"
    :aria-describedby="visible ? tipId : undefined"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @pointerdown="hide"
  >
    <slot />
  </span>
  <Teleport to="body">
    <Transition name="ui-tip">
      <div v-if="visible" :id="tipId" ref="tipRef" class="ui-tooltip" role="tooltip" :style="position">
        {{ label }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-tooltip__trigger {
  display: inline-flex;
  min-width: 0;
}

.ui-tooltip {
  z-index: calc(var(--ui-z-overlay) + 10);
  max-width: 280px;
  padding: 4px 8px;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  box-shadow: var(--ui-shadow-1);
  color: var(--ui-text);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  pointer-events: none;
}

.ui-tip-enter-active,
.ui-tip-leave-active {
  transition: opacity var(--ui-dur) var(--ui-ease);
}

.ui-tip-enter-from,
.ui-tip-leave-to {
  opacity: 0;
}
</style>
