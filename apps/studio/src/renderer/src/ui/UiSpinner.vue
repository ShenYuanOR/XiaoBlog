<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
    /** 状态文本；传 null 表示纯装饰（外层按钮会用 aria-busy 播报） */
    label?: string | null;
  }>(),
  { size: 16, label: '加载中' },
);
</script>

<template>
  <span
    class="ui-spinner"
    :class="{ 'is-decorative': !label }"
    :role="label ? 'status' : undefined"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <svg :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle
        class="ui-spinner__track"
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
      />
      <path
        class="ui-spinner__arc"
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </svg>
    <span v-if="label" class="ui-spinner__label">{{ label }}</span>
  </span>
</template>

<style scoped>
.ui-spinner {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  color: var(--ui-accent);
  animation: ui-spinner-rotate 800ms linear infinite;
}

.ui-spinner__track {
  opacity: 0.2;
}

/* 状态文本只给屏幕阅读器。 */
.ui-spinner__label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@keyframes ui-spinner-rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
