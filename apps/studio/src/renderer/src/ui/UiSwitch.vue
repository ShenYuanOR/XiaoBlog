<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md';
  }>(),
  { modelValue: false, size: 'md' },
);

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

function toggle(): void {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    role="switch"
    class="ui-switch"
    :class="[`ui-switch--${size}`, { 'is-on': modelValue, 'is-disabled': disabled }]"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="ui-switch__thumb" aria-hidden="true" />
  </button>
</template>

<style scoped>
.ui-switch {
  position: relative;
  display: inline-flex;
  flex: none;
  width: calc(var(--ui-s6) + var(--ui-s3));
  height: var(--ui-s5);
  padding: 0;
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-lg);
  background: var(--ui-raise);
  cursor: pointer;
  transition:
    background-color var(--ui-dur) var(--ui-ease),
    border-color var(--ui-dur) var(--ui-ease);
}

.ui-switch:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ui-switch.is-on {
  border-color: var(--ui-accent);
  background: var(--ui-accent);
}

.ui-switch.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-switch__thumb {
  position: absolute;
  top: calc(var(--ui-s1) / 2);
  left: calc(var(--ui-s1) / 2);
  width: calc(var(--ui-s5) - var(--ui-s1));
  height: calc(var(--ui-s5) - var(--ui-s1));
  border-radius: var(--ui-r-lg);
  background: var(--ui-text-2);
  transition:
    transform var(--ui-dur) var(--ui-ease),
    background-color var(--ui-dur) var(--ui-ease);
}

.ui-switch.is-on .ui-switch__thumb {
  background: var(--ui-on-accent);
  transform: translateX(var(--ui-s4));
}

/* 小号 */
.ui-switch--sm {
  width: calc(var(--ui-s5) + var(--ui-s2));
  height: var(--ui-s4);
}

.ui-switch--sm .ui-switch__thumb {
  width: calc(var(--ui-s4) - var(--ui-s1));
  height: calc(var(--ui-s4) - var(--ui-s1));
}

.ui-switch--sm.is-on .ui-switch__thumb {
  transform: translateX(var(--ui-s3));
}
</style>
