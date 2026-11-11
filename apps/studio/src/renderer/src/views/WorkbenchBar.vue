<script setup lang="ts">
import { computed } from 'vue';
import { copy } from '../copy.ts';
import { icons } from '../icons.ts';
import { useSession } from '../stores/session.ts';
import { UiBadge, UiIcon, UiSegmented, UiSpinner } from '../ui/index.ts';

const props = withDefaults(
  defineProps<{
    mode: 'visual' | 'source';
    badge: string;
    badgeTone?: 'accent' | 'neutral';
    saveDisabled?: boolean;
    /** HTML 文章固定源码，不提供可视化切换。 */
    showMode?: boolean;
  }>(),
  { badgeTone: 'neutral', saveDisabled: false, showMode: true },
);

const emit = defineEmits<{
  'update:mode': [value: 'visual' | 'source'];
  save: [];
}>();

const session = useSession();

const modeItems = [
  { key: 'visual', label: '编辑', icon: icons.edit },
  { key: 'source', label: '源码', icon: icons.code },
];

const modeKey = computed({
  get: () => props.mode,
  set: (value: string) => emit('update:mode', value === 'source' ? 'source' : 'visual'),
});

const saveText = computed(() => {
  switch (session.saveState) {
    case 'dirty':
      return copy.dirty;
    case 'saving':
      return copy.saving;
    case 'conflict':
      return copy.conflict;
    default:
      return copy.saved;
  }
});

const saveIcon = computed(() => {
  switch (session.saveState) {
    case 'dirty':
      return icons.edit;
    case 'saving':
      return icons.save;
    case 'conflict':
      return icons.alert;
    default:
      return icons.check;
  }
});
</script>

<template>
  <div class="workbench-bar">
    <button
      type="button"
      class="save-chip"
      :class="session.saveState"
      :disabled="saveDisabled"
      :aria-label="`保存状态：${saveText}，点击立即保存`"
      @click="emit('save')"
    >
      <UiSpinner v-if="session.saveState === 'saving'" :size="12" />
      <UiIcon v-else :path="saveIcon" :size="14" />
      <span>{{ saveText }}</span>
    </button>

    <UiBadge :tone="badgeTone">{{ badge }}</UiBadge>

    <slot name="meta" />

    <slot />

    <div class="bar-grow" />

    <UiSegmented
      v-if="showMode"
      class="mode-switch"
      v-model="modeKey"
      :items="modeItems"
      aria-label="编辑模式"
    />
  </div>
</template>

<style scoped>
.workbench-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ui-s2);
  height: calc(var(--ui-s6) + var(--ui-s5));
  padding: 0 var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  background: var(--ui-panel);
}

.bar-grow {
  flex: 1;
  min-width: var(--ui-s2);
}

.mode-switch {
  flex: none;
}

.save-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  height: var(--ui-h-sm);
  padding: 0 var(--ui-s2);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-lg);
  background: var(--ui-raise);
  color: var(--ui-text-2);
  font-family: var(--ui-font);
  font-size: var(--ui-fs-1);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color var(--ui-dur) var(--ui-ease),
    border-color var(--ui-dur) var(--ui-ease),
    color var(--ui-dur) var(--ui-ease);
}

.save-chip:hover:not(:disabled) {
  background: var(--ui-hover);
  color: var(--ui-text);
}

.save-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-chip.saved {
  border-color: var(--ui-ok-weak);
  color: var(--ui-ok);
}

.save-chip.dirty {
  border-color: var(--ui-warn-weak);
  color: var(--ui-warn);
}

.save-chip.saving {
  color: var(--ui-accent);
}

.save-chip.conflict {
  border-color: var(--ui-danger-weak);
  color: var(--ui-danger);
}
</style>
