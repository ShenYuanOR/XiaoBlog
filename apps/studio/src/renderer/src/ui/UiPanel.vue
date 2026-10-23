<script setup lang="ts">
import { ref, watch } from 'vue';
import { mdiChevronDown, mdiChevronRight } from '@mdi/js';
import UiIcon from './UiIcon.vue';

const props = withDefaults(
  defineProps<{
    title?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
  }>(),
  { title: '', collapsible: false, defaultOpen: true },
);

const emit = defineEmits<{
  'update:open': [open: boolean];
  toggle: [open: boolean];
}>();

const open = ref(props.collapsible ? props.defaultOpen : true);

watch(
  () => props.defaultOpen,
  (value) => {
    if (props.collapsible) open.value = value;
  },
);

function setOpen(value: boolean): void {
  if (!props.collapsible || open.value === value) return;
  open.value = value;
  emit('update:open', value);
  emit('toggle', value);
}
</script>

<template>
  <section class="ui-panel" :class="{ 'is-collapsed': !open }">
    <header v-if="title || collapsible || $slots.header || $slots.actions" class="ui-panel__head">
      <slot name="header">
        <button
          v-if="collapsible"
          type="button"
          class="ui-panel__toggle"
          :aria-expanded="open"
          :aria-label="title ? undefined : open ? '收起面板' : '展开面板'"
          @click="setOpen(!open)"
        >
          <UiIcon
            class="ui-panel__chevron"
            :path="open ? mdiChevronDown : mdiChevronRight"
            :size="16"
          />
          <span class="ui-panel__title">{{ title }}</span>
        </button>
        <h3 v-else class="ui-panel__title">{{ title }}</h3>
      </slot>
      <div v-if="$slots.actions" class="ui-panel__actions">
        <slot name="actions" />
      </div>
    </header>
    <div class="ui-panel__body">
      <div class="ui-panel__inner">
        <div class="ui-panel__content">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ui-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
  color: var(--ui-text);
}

.ui-panel__head {
  display: flex;
  align-items: center;
  gap: var(--ui-s2);
  min-height: 38px;
  padding: var(--ui-s1) var(--ui-s2) var(--ui-s1) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
}

.ui-panel.is-collapsed .ui-panel__head {
  border-bottom-color: transparent;
}

.ui-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-s1);
  min-height: var(--ui-h-sm);
  padding: 0;
  border: 0;
  border-radius: var(--ui-r-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--ui-fs-2);
  font-weight: 600;
  cursor: pointer;
}

.ui-panel__toggle:focus-visible {
  outline: 2px solid var(--ui-accent);
  outline-offset: 2px;
}

.ui-panel__chevron {
  color: var(--ui-text-3);
}

.ui-panel__title {
  margin: 0;
  overflow: hidden;
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  font-weight: 600;
  line-height: var(--ui-lh);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ui-panel__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-s1);
  margin-left: auto;
}

.ui-panel__body {
  display: grid;
  grid-template-rows: 1fr;
  min-height: 0;
  transition: grid-template-rows var(--ui-dur) var(--ui-ease);
}

.ui-panel.is-collapsed .ui-panel__body {
  grid-template-rows: 0fr;
}

.ui-panel__inner {
  min-height: 0;
  overflow: hidden;
}

.ui-panel__content {
  padding: var(--ui-s3);
}
</style>
