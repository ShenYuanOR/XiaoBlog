<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: number;
    min?: number;
    max?: number;
    step?: number;
    /** 数值后缀，如 px / % */
    unit?: string;
    disabled?: boolean;
    /** 是否在右侧显示当前值，默认显示 */
    showValue?: boolean;
  }>(),
  { modelValue: 0, min: 0, max: 100, step: 1, unit: '', showValue: true },
);

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const inputRef = ref<HTMLInputElement | null>(null);

// 轨道已填充比例，用 CSS 变量驱动渐变，颜色仍全部来自令牌。
const fill = computed(() => {
  const range = props.max - props.min;
  const ratio = range > 0 ? (props.modelValue - props.min) / range : 0;
  const percent = Math.min(100, Math.max(0, ratio * 100));
  return `${percent}%`;
});

const display = computed(() => `${props.modelValue}${props.unit ?? ''}`);

function onInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) emit('update:modelValue', value);
}

function focus(): void {
  inputRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <div class="ui-slider" :class="{ 'is-disabled': disabled }">
    <input
      ref="inputRef"
      type="range"
      class="ui-slider__control"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-valuetext="display"
      :style="{ '--ui-slider-fill': fill }"
      @input="onInput"
    />
    <span v-if="showValue" class="ui-slider__value" aria-hidden="true">{{ display }}</span>
  </div>
</template>

<style scoped>
.ui-slider {
  display: flex;
  align-items: center;
  gap: var(--ui-s3);
  width: 100%;
}

.ui-slider.is-disabled {
  opacity: 0.5;
}

.ui-slider__control {
  flex: 1;
  min-width: 0;
  height: var(--ui-h-sm);
  margin: 0;
  background: transparent;
  appearance: none;
  cursor: pointer;
}

.ui-slider__control:focus-visible {
  outline: none;
}

.ui-slider__control::-webkit-slider-runnable-track {
  height: var(--ui-s1);
  border-radius: var(--ui-r-lg);
  background: linear-gradient(
    to right,
    var(--ui-accent) 0 var(--ui-slider-fill, 0%),
    var(--ui-line-2) var(--ui-slider-fill, 0%)
  );
}

.ui-slider__control::-webkit-slider-thumb {
  width: var(--ui-s4);
  height: var(--ui-s4);
  margin-top: calc((var(--ui-s1) - var(--ui-s4)) / 2);
  border: 2px solid var(--ui-accent);
  border-radius: var(--ui-r-lg);
  background: var(--ui-text);
  appearance: none;
  transition: box-shadow var(--ui-dur) var(--ui-ease);
}

.ui-slider__control:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px var(--ui-accent-weak);
}

.ui-slider__control:disabled {
  cursor: not-allowed;
}

.ui-slider__value {
  flex: none;
  min-width: var(--ui-s8);
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
