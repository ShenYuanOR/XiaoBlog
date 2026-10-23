<script setup lang="ts">
import { computed, ref } from 'vue';
import UiIcon from './UiIcon.vue';

interface SegmentItem {
  key: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  items: SegmentItem[];
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [key: string];
}>();

const listRef = ref<HTMLDivElement | null>(null);

const activeIndex = computed(() => {
  const index = props.items.findIndex((item) => item.key === props.modelValue);
  return index >= 0 ? index : 0;
});

function focusAt(index: number): void {
  const items = listRef.value?.querySelectorAll<HTMLElement>('[role="tab"]');
  items?.[index]?.focus();
}

function select(key: string): void {
  if (key !== props.modelValue) emit('update:modelValue', key);
}

function onKeydown(event: KeyboardEvent): void {
  const last = props.items.length - 1;
  if (last < 0) return;
  let next: number;
  if (event.key === 'ArrowRight') next = activeIndex.value >= last ? 0 : activeIndex.value + 1;
  else if (event.key === 'ArrowLeft') next = activeIndex.value <= 0 ? last : activeIndex.value - 1;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = last;
  else return;
  const item = props.items[next];
  if (!item) return;
  event.preventDefault();
  select(item.key);
  focusAt(next);
}
</script>

<template>
  <div ref="listRef" class="ui-segmented" role="tablist" @keydown="onKeydown">
    <button
      v-for="(item, index) in items"
      :key="item.key"
      type="button"
      role="tab"
      class="ui-segmented__item"
      :class="{ 'is-active': item.key === modelValue }"
      :aria-selected="item.key === modelValue"
      :tabindex="index === activeIndex ? 0 : -1"
      @click="select(item.key)"
    >
      <UiIcon v-if="item.icon" :path="item.icon" :size="14" />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.ui-segmented {
  display: inline-flex;
  align-items: stretch;
  gap: 2px;
  padding: 2px;
  min-width: 0;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
}

.ui-segmented__item {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: calc(var(--ui-r-sm) - 2px);
  background: transparent;
  color: var(--ui-text-2);
  font: inherit;
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--ui-dur) var(--ui-ease),
    background var(--ui-dur) var(--ui-ease),
    box-shadow var(--ui-dur) var(--ui-ease);
}

.ui-segmented__item:hover {
  color: var(--ui-text);
}

.ui-segmented__item.is-active {
  background: var(--ui-panel);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-1);
}

.ui-segmented__item:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}
</style>
