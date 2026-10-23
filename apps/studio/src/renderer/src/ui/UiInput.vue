<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue';
import UiIcon from './UiIcon.vue';

// class/style 落根容器；placeholder / id / aria-* / @keydown 等透传到原生 input。
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    type?: string;
    placeholder?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    invalid?: boolean;
    /** 前置图标（mdi path） */
    icon?: string;
    /** 仅声明以接住 v-model 修饰符，避免它作为垃圾属性漏到 DOM */
    modelModifiers?: Record<string, boolean>;
  }>(),
  { modelValue: '', type: 'text', size: 'md' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>();

const attrs = useAttrs();
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }));
const controlAttrs = computed(() => {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class' || key === 'style') continue;
    rest[key] = value;
  }
  return rest;
});

const inputRef = ref<HTMLInputElement | null>(null);

function onInput(event: Event): void {
  let value: string | number = (event.target as HTMLInputElement).value;
  if (props.modelModifiers?.trim) value = String(value).trim();
  if (props.modelModifiers?.number) value = value === '' ? '' : Number(value);
  emit('update:modelValue', value);
}

/** 供外部（快捷键、表单校验）直接聚焦。 */
function focus(): void {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <span
    v-bind="rootAttrs"
    class="ui-input"
    :class="[
      `ui-input--${size}`,
      { 'is-disabled': disabled, 'is-invalid': invalid, 'has-icon': !!icon },
    ]"
  >
    <UiIcon v-if="icon" class="ui-input__icon" :path="icon" :size="16" />
    <input
      ref="inputRef"
      v-bind="controlAttrs"
      class="ui-input__control"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="onInput"
    />
  </span>
</template>

<style scoped>
.ui-input {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s2);
  width: 100%;
  height: var(--ui-h-md);
  padding: 0 var(--ui-s3);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text);
  transition:
    border-color var(--ui-dur) var(--ui-ease),
    background-color var(--ui-dur) var(--ui-ease),
    box-shadow var(--ui-dur) var(--ui-ease);
}

.ui-input--sm {
  height: var(--ui-h-sm);
  padding: 0 var(--ui-s2);
}

.ui-input:hover:not(.is-disabled) {
  border-color: var(--ui-text-3);
}

.ui-input:has(.ui-input__control:focus-visible) {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-weak);
}

.ui-input.is-invalid {
  border-color: var(--ui-danger);
}

.ui-input.is-invalid:has(.ui-input__control:focus-visible) {
  box-shadow: 0 0 0 3px var(--ui-danger-weak);
}

.ui-input.is-disabled {
  background: var(--ui-panel);
  color: var(--ui-text-3);
  cursor: not-allowed;
}

.ui-input__icon {
  color: var(--ui-text-3);
}

.ui-input__control {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: var(--ui-font);
  font-size: var(--ui-fs-3);
  line-height: var(--ui-lh);
}

.ui-input--sm .ui-input__control {
  font-size: var(--ui-fs-2);
}

.ui-input__control::placeholder {
  color: var(--ui-text-3);
}

/* 焦点环画在容器上，避免内层 outline 与容器边框叠成双环。 */
.ui-input__control:focus-visible {
  outline: none;
}

.ui-input__control:disabled {
  cursor: not-allowed;
}
</style>
