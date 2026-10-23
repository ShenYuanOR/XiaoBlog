<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { mdiMagnify } from '@mdi/js';
import UiIcon from './UiIcon.vue';
import UiKbd from './UiKbd.vue';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  icon?: string;
}

interface CommandEntry {
  item: CommandItem;
  index: number;
}

interface CommandGroup {
  name: string;
  entries: CommandEntry[];
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    items: CommandItem[];
    placeholder?: string;
    emptyText?: string;
  }>(),
  { placeholder: '搜索命令…', emptyText: '没有匹配的命令' },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  select: [id: string];
  close: [];
}>();

const uid = useId();
const listId = `${uid}-list`;
const inputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLDivElement | null>(null);
const search = ref('');
const activeIndex = ref(0);
let lastActive: HTMLElement | null = null;
let savedOverflow: string | null = null;

const groups = computed<CommandGroup[]>(() => {
  const keyword = search.value.trim().toLowerCase();
  const matched = props.items.filter((item) => {
    if (!keyword) return true;
    return [item.label, item.hint ?? '', item.group ?? ''].some((value) =>
      value.toLowerCase().includes(keyword),
    );
  });
  const result: CommandGroup[] = [];
  matched.forEach((item, index) => {
    const name = item.group ?? '';
    const last = result[result.length - 1];
    if (last && last.name === name) last.entries.push({ item, index });
    else result.push({ name, entries: [{ item, index }] });
  });
  return result;
});

const entries = computed<CommandEntry[]>(() =>
  groups.value.flatMap((group) => group.entries),
);

function optionId(index: number): string {
  return `${uid}-option-${index}`;
}

function setOpen(value: boolean): void {
  if (props.modelValue === value) return;
  emit('update:modelValue', value);
  if (!value) emit('close');
}

function close(): void {
  setOpen(false);
}

function choose(item: CommandItem): void {
  emit('select', item.id);
  setOpen(false);
}

async function move(delta: number): Promise<void> {
  const list = entries.value;
  if (list.length === 0) return;
  activeIndex.value = (activeIndex.value + delta + list.length) % list.length;
  await nextTick();
  listRef.value
    ?.querySelector<HTMLElement>(`[data-command-index="${activeIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' });
}

function onKeydown(event: KeyboardEvent): void {
  // 中文输入法组词期间不要抢 Enter / 方向键。
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    void move(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    void move(-1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const entry = entries.value[activeIndex.value];
    if (entry) choose(entry.item);
    return;
  }
  if (event.key === 'Tab') {
    // 命令面板聚焦在输入框，Tab 不应把焦点移到遮罩后的页面。
    event.preventDefault();
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.modelValue) return;
  event.preventDefault();
  event.stopPropagation();
  close();
}

watch(search, () => {
  activeIndex.value = 0;
});

watch(
  () => props.modelValue,
  async (value) => {
    if (value) {
      search.value = '';
      activeIndex.value = 0;
      lastActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onDocumentKeydown, true);
      await nextTick();
      inputRef.value?.focus();
    } else {
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
  document.removeEventListener('keydown', onDocumentKeydown, true);
  if (savedOverflow !== null) {
    document.body.style.overflow = savedOverflow;
    savedOverflow = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-command">
      <div v-if="modelValue" class="ui-command">
        <div class="ui-command__veil" aria-hidden="true" @click="close"></div>
        <div
          class="ui-command__panel"
          role="dialog"
          aria-modal="true"
          aria-label="命令面板"
          @keydown="onKeydown"
          @click.stop
        >
          <div class="ui-command__search">
            <UiIcon class="ui-command__search-icon" :path="mdiMagnify" :size="16" />
            <input
              ref="inputRef"
              v-model="search"
              class="ui-command__input"
              type="text"
              role="combobox"
              :aria-controls="entries.length > 0 ? listId : undefined"
              :aria-expanded="true"
              aria-autocomplete="list"
              :aria-activedescendant="entries.length > 0 ? optionId(activeIndex) : undefined"
              autocomplete="off"
              spellcheck="false"
              :placeholder="placeholder"
            />
            <UiKbd>Esc</UiKbd>
          </div>
          <div
            v-if="entries.length > 0"
            ref="listRef"
            :id="listId"
            class="ui-command__list"
            role="listbox"
          >
            <template v-for="group in groups" :key="group.name">
              <div v-if="group.name" class="ui-command__group" role="presentation">
                {{ group.name }}
              </div>
              <button
                v-for="entry in group.entries"
                :id="optionId(entry.index)"
                :key="entry.item.id"
                type="button"
                role="option"
                class="ui-command__item"
                :class="{ 'is-active': entry.index === activeIndex }"
                :aria-selected="entry.index === activeIndex"
                :data-command-index="entry.index"
                @mouseenter="activeIndex = entry.index"
                @click="choose(entry.item)"
              >
                <UiIcon v-if="entry.item.icon" class="ui-command__icon" :path="entry.item.icon" :size="16" />
                <span class="ui-command__label">{{ entry.item.label }}</span>
                <span v-if="entry.item.hint" class="ui-command__hint">{{ entry.item.hint }}</span>
              </button>
            </template>
          </div>
          <div v-else class="ui-command__list">
            <div class="ui-command__empty" role="status">{{ emptyText }}</div>
          </div>
          <footer class="ui-command__foot">
            <span class="ui-command__tips"><UiKbd>↑</UiKbd><UiKbd>↓</UiKbd> 选择</span>
            <span class="ui-command__tips"><UiKbd>Enter</UiKbd> 执行</span>
            <span class="ui-command__tips"><UiKbd>Esc</UiKbd> 关闭</span>
            <span class="ui-command__count">{{ entries.length }} 项</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-command {
  position: fixed;
  inset: 0;
  z-index: calc(var(--ui-z-overlay) + 1);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh var(--ui-s6) var(--ui-s6);
}

.ui-command__veil {
  position: absolute;
  inset: 0;
  background: var(--ui-bg);
  opacity: 0.72;
  backdrop-filter: blur(2px);
}

.ui-command__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: 100%;
  max-height: 60vh;
  overflow: hidden;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
  box-shadow: var(--ui-shadow-2);
  color: var(--ui-text);
  transition: transform var(--ui-dur) var(--ui-ease);
}

.ui-command__search {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s2);
  height: 44px;
  padding: 0 var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.ui-command__search-icon {
  flex: none;
  color: var(--ui-text-3);
}

.ui-command__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font: inherit;
  font-size: var(--ui-fs-3);
  line-height: var(--ui-lh);
  outline: none;
}

.ui-command__input::placeholder {
  color: var(--ui-text-3);
}

.ui-command__list {
  flex: 1;
  min-height: 0;
  padding: var(--ui-s2);
  overflow: auto;
}

.ui-command__group {
  padding: var(--ui-s2) var(--ui-s2) var(--ui-s1);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.ui-command__item {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
  height: 32px;
  padding: 0 var(--ui-s2);
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text-2);
  font: inherit;
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  text-align: left;
  cursor: pointer;
}

.ui-command__item.is-active {
  background: var(--ui-active);
  color: var(--ui-text);
}

.ui-command__icon {
  flex: none;
  color: var(--ui-text-3);
}

.ui-command__item.is-active .ui-command__icon {
  color: var(--ui-accent);
}

.ui-command__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-command__hint {
  flex: none;
  margin-left: auto;
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.ui-command__empty {
  padding: var(--ui-s6) var(--ui-s3);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-2);
  text-align: center;
}

.ui-command__foot {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s3);
  padding: var(--ui-s2) var(--ui-s3);
  border-top: 1px solid var(--ui-line);
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.ui-command__tips {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
}

.ui-command__count {
  margin-left: auto;
}

.ui-command-enter-active,
.ui-command-leave-active {
  transition: opacity var(--ui-dur) var(--ui-ease);
}

.ui-command-enter-from,
.ui-command-leave-to {
  opacity: 0;
}

.ui-command-enter-from .ui-command__panel,
.ui-command-leave-to .ui-command__panel {
  transform: translateY(-6px) scale(0.99);
}
</style>
