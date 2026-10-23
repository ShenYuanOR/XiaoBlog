<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';
    size?: 'sm' | 'md';
    /** 文字前的小圆点 */
    dot?: boolean;
  }>(),
  { tone: 'neutral', size: 'sm' },
);
</script>

<template>
  <span class="ui-badge" :class="[`ui-badge--${tone}`, `ui-badge--${size}`]">
    <span v-if="dot" class="ui-badge__dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.ui-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  height: var(--ui-s5);
  padding: 0 var(--ui-s2);
  border: 1px solid transparent;
  border-radius: var(--ui-r-lg);
  font-size: var(--ui-fs-1);
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.ui-badge--md {
  height: var(--ui-s6);
  padding: 0 var(--ui-s2);
  font-size: var(--ui-fs-2);
}

.ui-badge__dot {
  width: var(--ui-s1);
  height: var(--ui-s1);
  border-radius: var(--ui-r-lg);
  background: currentColor;
}

.ui-badge--neutral {
  background: var(--ui-raise);
  border-color: var(--ui-line);
  color: var(--ui-text-2);
}

.ui-badge--accent {
  background: var(--ui-accent-weak);
  border-color: var(--ui-accent-weak);
  color: var(--ui-accent);
}

.ui-badge--ok {
  background: var(--ui-ok-weak);
  border-color: var(--ui-ok-weak);
  color: var(--ui-ok);
}

.ui-badge--warn {
  background: var(--ui-warn-weak);
  border-color: var(--ui-warn-weak);
  color: var(--ui-warn);
}

.ui-badge--danger {
  background: var(--ui-danger-weak);
  border-color: var(--ui-danger-weak);
  color: var(--ui-danger);
}
</style>
