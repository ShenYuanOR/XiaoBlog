<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue';

// class/style 落根容器；其余 attrs 透传到原生 textarea。
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    invalid?: boolean;
    /** 仅声明以接住 v-model 修饰符，避免它作为垃圾属性漏到 DOM */
    modelModifiers?: Record<string, boolean>;
  }>(),
  { modelValue: '', rows: 4 },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

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

const textareaRef = ref<HTMLTextAreaElement | null>(null);

function onInput(event: Event): void {
  const raw = (event.target as HTMLTextAreaElement).value;
  emit('update:modelValue', props.modelModifiers?.trim ? raw.trim() : raw);
}

function focus(): void {
  textareaRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <span
    v-bind="rootAttrs"
    class="ui-textarea"
    :class="{ 'is-disabled': disabled, 'is-invalid': invalid }"
  >
    <textarea
      ref="textareaRef"
      v-bind="controlAttrs"
      class="ui-textarea__control"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="rows"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="onInput"
    />
  </span>
</template>

<style scoped>
.ui-textarea {
  display: inline-flex;
  width: 100%;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text);
  transition:
    border-color var(--ui-dur) var(--ui-ease),
    background-color var(--ui-dur) var(--ui-ease),
    box-shadow var(--ui-dur) var(--ui-ease);
}

.ui-textarea:hover:not(.is-disabled) {
  border-color: var(--ui-text-3);
}

.ui-textarea:has(.ui-textarea__control:focus-visible) {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px var(--ui-accent-weak);
}

.ui-textarea.is-invalid {
  border-color: var(--ui-danger);
}

.ui-textarea.is-invalid:has(.ui-textarea__control:focus-visible) {
  box-shadow: 0 0 0 3px var(--ui-danger-weak);
}

.ui-textarea.is-disabled {
  background: var(--ui-panel);
  color: var(--ui-text-3);
  cursor: not-allowed;
}

.ui-textarea__control {
  width: 100%;
  min-height: var(--ui-s8);
  padding: var(--ui-s2) var(--ui-s3);
  border: 0;
  background: transparent;
  color: inherit;
  font-family: var(--ui-font);
  font-size: var(--ui-fs-3);
  line-height: var(--ui-lh);
  resize: vertical;
}

.ui-textarea__control::placeholder {
  color: var(--ui-text-3);
}

.ui-textarea__control:focus-visible {
  outline: none;
}

.ui-textarea__control:disabled {
  cursor: not-allowed;
}
</style>
