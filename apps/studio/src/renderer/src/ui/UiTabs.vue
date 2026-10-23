<script setup lang="ts">
import { computed, ref } from 'vue';
import UiIcon from './UiIcon.vue';

interface TabItem {
  key: string;
  label: string;
  icon?: string;
}

const props = defineProps<{
  items: TabItem[];
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [key: string];
}>();

const listRef = ref<HTMLDivElement | null>(null);

/** 选中项下标；外部传入的 key 不存在时回落到第一项，保证键盘可达。 */
const activeIndex = computed(() => {
  const index = props.items.findIndex((item) => item.key === props.modelValue);
  return index >= 0 ? index : 0;
});

function focusAt(index: number): void {
  const tabs = listRef.value?.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs?.[index]?.focus();
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
  <div ref="listRef" class="ui-tabs" role="tablist" @keydown="onKeydown">
    <button
      v-for="(item, index) in items"
      :key="item.key"
      type="button"
      role="tab"
      class="ui-tabs__tab"
      :class="{ 'is-active': item.key === modelValue }"
      :aria-selected="item.key === modelValue"
      :tabindex="index === activeIndex ? 0 : -1"
      @click="select(item.key)"
    >
      <UiIcon v-if="item.icon" class="ui-tabs__icon" :path="item.icon" :size="16" />
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.ui-tabs {
  display: flex;
  align-items: stretch;
  gap: var(--ui-s1);
  min-width: 0;
  border-bottom: 1px solid var(--ui-line);
}

.ui-tabs__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s2);
  height: 32px;
  padding: 0 var(--ui-s3);
  border: 0;
  border-radius: var(--ui-r-sm) var(--ui-r-sm) 0 0;
  background: transparent;
  color: var(--ui-text-2);
  font: inherit;
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--ui-dur) var(--ui-ease),
    background var(--ui-dur) var(--ui-ease);
}

.ui-tabs__tab:hover {
  color: var(--ui-text);
  background: var(--ui-hover);
}

.ui-tabs__tab.is-active {
  color: var(--ui-text);
}

.ui-tabs__tab.is-active::after {
  content: '';
  position: absolute;
  right: var(--ui-s2);
  bottom: -1px;
  left: var(--ui-s2);
  height: 2px;
  border-radius: 1px;
  background: var(--ui-accent);
}

.ui-tabs__tab:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.ui-tabs__icon {
  color: var(--ui-text-3);
}

.ui-tabs__tab.is-active .ui-tabs__icon {
  color: var(--ui-accent);
}
</style>
