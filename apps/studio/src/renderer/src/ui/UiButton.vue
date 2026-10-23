<script setup lang="ts">
import { computed } from 'vue';
import UiIcon from './UiIcon.vue';
import UiSpinner from './UiSpinner.vue';

/** 图标按钮（icon 为路径或 true）必须自行传 aria-label。 */
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'default' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    loading?: boolean;
    /** 撑满容器宽度 */
    block?: boolean;
    /** 图标按钮：传 mdi path 字符串；或传 true 表示图标由默认插槽提供 */
    icon?: boolean | string;
    /** 文字左侧图标（mdi path） */
    iconLeft?: string;
    /** 文字右侧图标（mdi path） */
    iconRight?: string;
  }>(),
  { variant: 'default', size: 'md', type: 'button' },
);

const iconPath = computed(() => (typeof props.icon === 'string' ? props.icon : undefined));
const iconOnly = computed(() => props.icon === true || Boolean(iconPath.value));
const iconSize = computed(() => {
  if (props.size === 'sm') return iconOnly.value ? 16 : 14;
  return iconOnly.value ? 18 : 16;
});
// 纯图标按钮 loading 时用 spinner 替换图标；普通按钮 loading 时保留文字，避免宽度跳动。
const showSlot = computed(() => !iconOnly.value || (!props.loading && props.icon === true));
</script>

<template>
  <button
    class="ui-button"
    :class="[
      `ui-button--${variant}`,
      `ui-button--${size}`,
      { 'is-block': block, 'is-icon': iconOnly, 'is-loading': loading },
    ]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading ? 'true' : undefined"
  >
    <UiSpinner v-if="loading" class="ui-button__spinner" :label="null" :size="iconSize" />
    <UiIcon v-else-if="iconPath" :path="iconPath" :size="iconSize" />
    <UiIcon v-if="!loading && iconLeft" :path="iconLeft" :size="iconSize" />
    <span v-if="showSlot" class="ui-button__label"><slot /></span>
    <UiIcon v-if="!loading && iconRight" :path="iconRight" :size="iconSize" />
  </button>
</template>

<style scoped>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-s2);
  height: var(--ui-h-md);
  padding: 0 var(--ui-s3);
  border: 1px solid transparent;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: var(--ui-text);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-2);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition:
    background-color var(--ui-dur) var(--ui-ease),
    border-color var(--ui-dur) var(--ui-ease),
    color var(--ui-dur) var(--ui-ease),
    box-shadow var(--ui-dur) var(--ui-ease);
}

.ui-button--sm {
  height: var(--ui-h-sm);
  padding: 0 var(--ui-s2);
  font-size: var(--ui-fs-1);
}

.ui-button:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ui-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-button.is-loading {
  cursor: progress;
}

.ui-button.is-block {
  width: 100%;
}

.ui-button.is-icon {
  width: var(--ui-h-md);
  padding: 0;
  gap: 0;
}

.ui-button.is-icon.ui-button--sm {
  width: var(--ui-h-sm);
}

.ui-button__label {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
}

/* 主按钮 */
.ui-button--primary {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
  color: var(--ui-on-accent);
}

.ui-button--primary:hover:not(:disabled) {
  border-color: var(--ui-accent-hover);
  background: var(--ui-accent-hover);
}

.ui-button--primary:active:not(:disabled) {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
}

/* 默认按钮 */
.ui-button--default {
  border-color: var(--ui-line-2);
  background: var(--ui-raise);
  color: var(--ui-text);
}

.ui-button--default:hover:not(:disabled) {
  background: var(--ui-hover);
}

.ui-button--default:active:not(:disabled) {
  background: var(--ui-active);
}

/* 幽灵按钮 */
.ui-button--ghost {
  color: var(--ui-text-2);
}

.ui-button--ghost:hover:not(:disabled) {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.ui-button--ghost:active:not(:disabled) {
  background: var(--ui-active);
}

/* 危险按钮 */
.ui-button--danger {
  border-color: var(--ui-danger);
  background: var(--ui-danger);
  color: var(--ui-on-danger);
}

.ui-button--danger:hover:not(:disabled) {
  border-color: var(--ui-danger-hover);
  background: var(--ui-danger-hover);
}

/* 按钮里的 spinner 跟随按钮前景色 */
.ui-button__spinner {
  color: inherit;
}
</style>
