<script setup lang="ts">
import { icons } from '../icons.ts';
import { dismiss, notices, type NoticeAction } from '../notice.ts';
import { UiButton, UiIcon } from '../ui/index.ts';

function runAction(id: number, action: NoticeAction): void {
  action.run();
  dismiss(id);
}
</script>

<template>
  <TransitionGroup tag="div" name="toast" class="toasts" aria-live="polite" aria-atomic="false">
    <div
      v-for="item in notices"
      :key="item.id"
      class="toast"
      :class="`toast--${item.kind}`"
      @click="dismiss(item.id)"
    >
      <span class="toast__icon">
        <UiIcon :path="item.kind === 'error' ? icons.alert : icons.ok" :size="16" />
      </span>
      <p class="toast__text">{{ item.text }}</p>
      <button v-if="item.action" type="button" class="toast__action" @click.stop="runAction(item.id, item.action)">
        {{ item.action.label }}
      </button>
      <UiButton
        class="toast__close"
        variant="ghost"
        size="sm"
        :icon="icons.close"
        aria-label="关闭提示"
        @click.stop="dismiss(item.id)"
      />
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toasts {
  position: fixed;
  top: 56px;
  right: var(--ui-s6);
  z-index: var(--ui-z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
  width: min(400px, calc(100vw - var(--ui-s8)));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-line-2);
  border-left: 3px solid var(--ui-accent);
  border-radius: var(--ui-r);
  background: var(--ui-panel);
  box-shadow: var(--ui-shadow-2);
  color: var(--ui-text);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
  cursor: pointer;
  pointer-events: auto;
}

.toast--error {
  border-left-color: var(--ui-danger);
}

.toast__icon {
  display: inline-flex;
  flex: none;
  margin-top: 1px;
  color: var(--ui-accent);
}

.toast--error .toast__icon {
  color: var(--ui-danger);
}

.toast__text {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.toast__action {
  flex: none;
  border: 0;
  background: transparent;
  color: var(--ui-accent);
  font: inherit;
  cursor: pointer;
}

.toast__close {
  flex: none;
  margin: -4px -4px -4px 0;
  color: var(--ui-text-3);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--ui-dur) var(--ui-ease),
    transform var(--ui-dur) var(--ui-ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(var(--ui-s2));
}

.toast-move {
  transition: transform var(--ui-dur) var(--ui-ease);
}
</style>
