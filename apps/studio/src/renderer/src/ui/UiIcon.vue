<script setup lang="ts">
withDefaults(
  defineProps<{
    /** @mdi/js 的 path 字符串 */
    path: string;
    /** 默认 18px；工具条用 16px */
    size?: number;
    /** 有值时作为可读图标（role="img" + aria-label）；否则对辅助技术隐藏 */
    title?: string;
  }>(),
  { size: 18 },
);
</script>

<template>
  <svg
    class="ui-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :role="title ? 'img' : undefined"
    :aria-label="title || undefined"
    :aria-hidden="title ? undefined : 'true'"
    focusable="false"
  >
    <path fill="currentColor" :d="path" />
  </svg>
</template>

<style scoped>
.ui-icon {
  display: inline-block;
  flex: none;
  vertical-align: -0.15em;
}
</style>
