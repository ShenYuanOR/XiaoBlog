<script setup lang="ts">
import { mdiInboxOutline } from '@mdi/js';
import UiIcon from './UiIcon.vue';

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    /** mdi path，默认空收件箱 */
    icon?: string;
  }>(),
  { title: '暂无内容', description: '', icon: mdiInboxOutline },
);
</script>

<template>
  <div class="ui-empty">
    <span class="ui-empty__icon">
      <UiIcon :path="icon" :size="28" />
    </span>
    <p class="ui-empty__title">{{ title }}</p>
    <p v-if="description" class="ui-empty__desc">{{ description }}</p>
    <div v-if="$slots.action" class="ui-empty__action"><slot name="action" /></div>
    <slot />
  </div>
</template>

<style scoped>
.ui-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-s2);
  padding: var(--ui-s8) var(--ui-s6);
  text-align: center;
}

.ui-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-s8);
  height: var(--ui-s8);
  margin-bottom: var(--ui-s1);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-lg);
  background: var(--ui-raise);
  color: var(--ui-text-3);
}

.ui-empty__title {
  color: var(--ui-text);
  font-size: var(--ui-fs-4);
  font-weight: 600;
  line-height: 1.3;
}

.ui-empty__desc {
  max-width: 44ch;
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.ui-empty__action {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  margin-top: var(--ui-s2);
}
</style>
