<script setup lang="ts">
import { computed, onMounted, onUpdated, ref, useId } from 'vue';

const props = defineProps<{
  label?: string;
  hint?: string;
  error?: string;
  /** 指定子控件的 id；不传时由组件生成并自动补给槽内第一个控件 */
  for?: string;
  required?: boolean;
}>();

const CONTROL_SELECTOR = 'input, textarea, select, button[role="switch"]';

const uid = useId();
const root = ref<HTMLElement | null>(null);
// label 的 for 目标：优先用外部传入，否则自动生成；若子控件已有 id，则以子控件为准。
const labelFor = ref(props.for ?? `ui-field-${uid}`);
const hintId = computed(() => `${labelFor.value}-hint`);
const errorId = computed(() => `${labelFor.value}-error`);
const describedBy = computed(() => {
  if (props.error) return errorId.value;
  if (props.hint) return hintId.value;
  return '';
});

let externalDescribedBy = '';
let synced = false;

/**
 * 把 label 与提示文本真正关联到槽内第一个表单控件上：
 * 子控件没有 id 时补一个，已有 id 时以它为准，并合并 aria-describedby。
 */
function syncControl(): void {
  const control = root.value?.querySelector<HTMLElement>(CONTROL_SELECTOR);
  if (!control) return;
  if (!synced) {
    externalDescribedBy = control.getAttribute('aria-describedby') ?? '';
    synced = true;
  }
  if (!control.id) control.id = labelFor.value;
  if (control.id !== labelFor.value) labelFor.value = control.id;
  const merged = [externalDescribedBy, describedBy.value].filter(Boolean).join(' ');
  if (merged) control.setAttribute('aria-describedby', merged);
  else if (control.hasAttribute('aria-describedby')) control.removeAttribute('aria-describedby');
  if (props.required) control.setAttribute('aria-required', 'true');
  else if (control.getAttribute('aria-required') === 'true')
    control.removeAttribute('aria-required');
}

onMounted(syncControl);
onUpdated(syncControl);
</script>

<template>
  <div ref="root" class="ui-field">
    <div v-if="label || $slots.action" class="ui-field__head">
      <label v-if="label" class="ui-field__label" :for="labelFor">
        {{ label }}<span v-if="required" class="ui-field__required" aria-hidden="true">*</span>
      </label>
      <div v-if="$slots.action" class="ui-field__action"><slot name="action" /></div>
    </div>
    <div class="ui-field__control">
      <slot :id="labelFor" :describedBy="describedBy" />
    </div>
    <p v-if="error" :id="errorId" class="ui-field__error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="hintId" class="ui-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s1);
  width: 100%;
  min-width: 0;
}

.ui-field__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  min-height: var(--ui-s5);
}

.ui-field__label {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  font-weight: 500;
  line-height: var(--ui-lh);
}

.ui-field__required {
  margin-left: var(--ui-s1);
  color: var(--ui-danger);
}

.ui-field__action {
  margin-left: auto;
}

.ui-field__control {
  display: flex;
  min-width: 0;
}

.ui-field__hint {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.ui-field__error {
  color: var(--ui-danger);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}
</style>
