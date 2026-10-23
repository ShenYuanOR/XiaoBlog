<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' }>(), { size: 'sm' });
</script>

<template>
  <kbd class="ui-kbd" :class="`ui-kbd--${size}`"><slot /></kbd>
</template>

<style scoped>
.ui-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--ui-s5);
  min-height: var(--ui-s5);
  padding: 0 var(--ui-s1);
  border: 1px solid var(--ui-line-2);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

.ui-kbd--md {
  min-width: var(--ui-s6);
  min-height: var(--ui-s6);
  padding: 0 var(--ui-s2);
  font-size: var(--ui-fs-2);
}
</style>
