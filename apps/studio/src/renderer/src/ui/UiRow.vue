<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    selected?: boolean;
    /** 缩进像素，用于树/嵌套列表对齐。 */
    indent?: number;
    disabled?: boolean;
  }>(),
  { selected: false, indent: 0, disabled: false },
);

const emit = defineEmits<{
  click: [event: MouseEvent | KeyboardEvent];
  contextmenu: [event: MouseEvent];
}>();

const rowStyle = computed<Record<string, string>>(() => ({
  paddingLeft: `calc(var(--ui-s2) + ${props.indent}px)`,
}));

function activate(event: MouseEvent | KeyboardEvent): void {
  if (props.disabled) return;
  emit('click', event);
}

function onContextMenu(event: MouseEvent): void {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  emit('contextmenu', event);
}
</script>

<template>
  <div
    class="ui-row"
    :class="{ 'is-selected': selected, 'is-disabled': disabled }"
    :style="rowStyle"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled || undefined"
    :aria-pressed="selected || undefined"
    @click="activate"
    @contextmenu="onContextMenu"
    @keydown.enter.prevent="activate"
    @keydown.space.prevent="activate"
  >
    <span v-if="$slots.icon" class="ui-row__icon">
      <slot name="icon" />
    </span>
    <span class="ui-row__main">
      <slot />
    </span>
    <span v-if="$slots.meta" class="ui-row__meta">
      <slot name="meta" />
    </span>
  </div>
</template>

<style scoped>
.ui-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: var(--ui-h-sm);
  padding-right: var(--ui-s3);
  border-radius: var(--ui-r-sm);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  cursor: pointer;
  user-select: none;
  transition: background var(--ui-dur) var(--ui-ease);
}

.ui-row:hover {
  background: var(--ui-hover);
}

.ui-row.is-selected {
  background: var(--ui-active);
  color: var(--ui-text);
}

.ui-row.is-selected::before {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 2px;
  border-radius: 1px;
  background: var(--ui-accent);
}

.ui-row:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: -2px;
}

.ui-row.is-disabled {
  opacity: 0.45;
  cursor: default;
}

.ui-row__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  color: var(--ui-text-3);
}

.ui-row.is-selected .ui-row__icon {
  color: var(--ui-accent);
}

.ui-row__main {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-row__meta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s1);
  margin-left: auto;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
}
</style>
