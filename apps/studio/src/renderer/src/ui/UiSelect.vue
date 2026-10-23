<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue';
import { mdiChevronDown } from '@mdi/js';
import UiIcon from './UiIcon.vue';

// class/style 落根容器；其余 attrs 透传到原生 select。
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    options: { value: string | number; label: string; disabled?: boolean }[];
    placeholder?: string;
    size?: 'sm' | 'md';
    disabled?: boolean;
    invalid?: boolean;
  }>(),
  { modelValue: '', size: 'md' },
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

const selectRef = ref<HTMLSelectElement | null>(null);

// 原生 option 的 value 只能是字符串，这里用下标做桥接，回传时还原成原始类型。
const selected = computed(() => {
  const index = props.options.findIndex((option) => option.value === props.modelValue);
  return index < 0 ? '' : String(index);
});

function onChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value;
  if (raw === '') {
    emit('update:modelValue', '');
    return;
  }
  const option = props.options[Number(raw)];
  if (option) emit('update:modelValue', option.value);
}

function focus(): void {
  selectRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <span
    v-bind="rootAttrs"
    class="ui-select"
    :class="[
      `ui-select--${size}`,
      {
        'is-disabled': disabled,
        'is-invalid': invalid,
        'is-empty': selected === '',
      },
    ]"
  >
    <select
      ref="selectRef"
      v-bind="controlAttrs"
      class="ui-select__control"
      :value="selected"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      @change="onChange"
    >
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option
        v-for="(option, index) in options"
        :key="index"
        :value="String(index)"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <UiIcon class="ui-select__chevron" :path="mdiChevronDown" :size="16" />
  </span>
</template>

<style scoped>
.ui-select {
  position: relative;
  display: inline-flex;
  width: 100%;
  height: var(--ui-h-md);
  color: var(--ui-text);
}

.ui-select--sm {
  height: var(--ui-h-sm);
}

.ui-select__control {
  width: 100%;
  height: 100%;
  padding: 0 var(--ui-s7) 0 var(--ui-s3);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: inherit;
  font-family: var(--ui-font);
  font-size: var(--ui-fs-3);
  line-height: var(--ui-lh);
  appearance: none;
  cursor: pointer;
  transition:
    border-color var(--ui-dur) var(--ui-ease),
    background-color var(--ui-dur) var(--ui-ease),
    box-shadow var(--ui-dur) var(--ui-ease);
}

.ui-select--sm .ui-select__control {
  padding: 0 var(--ui-s6) 0 var(--ui-s2);
  font-size: var(--ui-fs-2);
}

.ui-select:hover:not(.is-disabled) .ui-select__control {
  border-color: var(--ui-text-3);
}

.ui-select__control:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ui-select.is-invalid .ui-select__control {
  border-color: var(--ui-danger);
}

.ui-select.is-disabled {
  color: var(--ui-text-3);
  cursor: not-allowed;
}

.ui-select.is-disabled .ui-select__control {
  background: var(--ui-panel);
  cursor: not-allowed;
  opacity: 0.8;
}

/* 未选中 / 占位态用弱化文字。 */
.ui-select.is-empty .ui-select__control {
  color: var(--ui-text-3);
}

.ui-select__chevron {
  position: absolute;
  top: 50%;
  right: var(--ui-s2);
  color: var(--ui-text-2);
  pointer-events: none;
  transform: translateY(-50%);
}

.ui-select--sm .ui-select__chevron {
  right: var(--ui-s1);
}
</style>
