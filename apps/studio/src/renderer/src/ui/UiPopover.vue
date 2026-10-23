<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';

type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'right-start';

const props = withDefaults(
  defineProps<{
    placement?: PopoverPlacement;
    /** 受控开关（可选）；不传则由 trigger 点击自行管理。 */
    modelValue?: boolean;
    disabled?: boolean;
    /** 与触发元素的间距（px）。 */
    offset?: number;
  }>(),
  { placement: 'bottom-start', modelValue: undefined, disabled: false, offset: 6 },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  open: [];
  close: [];
}>();

const innerOpen = ref(false);
const controlled = computed(() => props.modelValue !== undefined);
const open = computed(() => (controlled.value ? props.modelValue === true : innerOpen.value));

const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const position = ref<CSSProperties>({ position: 'fixed', top: '0px', left: '0px' });

function setOpen(value: boolean): void {
  if (value === open.value) return;
  if (!controlled.value) innerOpen.value = value;
  emit('update:modelValue', value);
  emit(value ? 'open' : 'close');
}

function toggle(): void {
  if (props.disabled) return;
  setOpen(!open.value);
}

async function place(): Promise<void> {
  const trigger = triggerRef.value;
  if (!trigger) return;
  await nextTick();
  const rect = trigger.getBoundingClientRect();
  const panel = panelRef.value;
  const gap = props.offset;
  const panelWidth = panel?.offsetWidth ?? 208;
  const panelHeight = panel?.offsetHeight ?? 0;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8;
  let left: number;
  let top: number;
  if (props.placement === 'right-start') {
    left = rect.right + gap;
    top = rect.top;
  } else {
    top = rect.bottom + gap;
    left = props.placement === 'bottom-end' ? rect.right - panelWidth : rect.left;
  }
  left = Math.min(Math.max(margin, left), Math.max(margin, viewportWidth - panelWidth - margin));
  if (top + panelHeight > viewportHeight - margin) {
    const above = rect.top - panelHeight - gap;
    top = above >= margin ? above : Math.max(margin, viewportHeight - panelHeight - margin);
  }
  position.value = {
    position: 'fixed',
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    minWidth: `${Math.round(rect.width)}px`,
  };
}

function onTriggerClick(): void {
  toggle();
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (triggerRef.value?.contains(target)) return;
  if (panelRef.value?.contains(target)) return;
  setOpen(false);
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return;
  event.stopPropagation();
  setOpen(false);
}

function onViewportChange(): void {
  void place();
}

function addListeners(): void {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeydown, true);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
}

function removeListeners(): void {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeydown, true);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
}

watch(
  open,
  async (value) => {
    if (value) {
      addListeners();
      await place();
    } else {
      removeListeners();
    }
  },
  { immediate: true },
);

onBeforeUnmount(removeListeners);
</script>

<template>
  <span ref="triggerRef" class="ui-popover__trigger" @click="onTriggerClick">
    <slot name="trigger" :open="open" :toggle="toggle" />
  </span>
  <Teleport to="body">
    <Transition name="ui-pop">
      <div
        v-if="open"
        ref="panelRef"
        class="ui-popover"
        role="dialog"
        :style="position"
        @click.stop
      >
        <slot :close="() => setOpen(false)" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-popover__trigger {
  display: inline-flex;
  min-width: 0;
}

.ui-popover {
  z-index: var(--ui-z-dropdown);
  max-width: 320px;
  max-height: 70vh;
  padding: var(--ui-s2);
  overflow: auto;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
  box-shadow: var(--ui-shadow-2);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.ui-pop-enter-active,
.ui-pop-leave-active {
  transition:
    opacity var(--ui-dur) var(--ui-ease),
    transform var(--ui-dur) var(--ui-ease);
}

.ui-pop-enter-from,
.ui-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
