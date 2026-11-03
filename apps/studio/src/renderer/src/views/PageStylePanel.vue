<script setup lang="ts">
/**
 * 页面画布的样式令牌面板。
 *
 * 和文章区块面板共用同一套 xiao.css 令牌；页面这边既可能落在组件实例的 class，
 * 也可能落在普通元素上。组件已有 pad/bg 等 prop 时，优先用上面的组件选项，
 * 令牌面板负责 prop 没覆盖到的样式。
 */

import { computed, onMounted, ref, watch } from 'vue';
import { TOKEN_GROUPS, groupValue, withColumnsValue, withGroupValue } from '../editor/block-style.ts';
import { UiField, UiSelect } from '../ui/index.ts';

const props = defineProps<{ classes: string[]; covered?: string[]; siteDir: string }>();
const emit = defineEmits<{ change: [value: string[]] }>();

const LAYOUT_KEYS = ['width', 'pad', 'marginTop', 'marginBottom', 'cols', 'gap', 'span'];
const LOOK_KEYS = ['bg', 'radius', 'border', 'shadow'];
const TEXT_KEYS = ['textSize', 'weight', 'color', 'align'];

const COVERED_BY_PROP: Record<string, string> = {
  width: 'width',
  pad: 'pad',
  cols: 'cols',
  gap: 'gap',
  bg: 'bg',
};
const covered = computed(() => new Set(props.covered ?? []));
const breakpoints = ref<{ id: string; label: string }[]>([]);
const device = ref('base');
const deviceOptions = computed(() => [
  { value: 'base', label: '基础' },
  ...breakpoints.value.map((item) => ({ value: item.id, label: item.label })),
]);
const layoutKeys = computed(() => {
  if (device.value === 'base') {
    return LAYOUT_KEYS.filter((key) => !covered.value.has(COVERED_BY_PROP[key] ?? ''));
  }
  return LAYOUT_KEYS.filter((key) => !['marginTop', 'marginBottom', 'span'].includes(key));
});
const lookKeys = computed(() =>
  device.value === 'base'
    ? LOOK_KEYS.filter((key) => !covered.value.has(COVERED_BY_PROP[key] ?? ''))
    : LOOK_KEYS,
);
const textKeys = computed(() => TEXT_KEYS);

onMounted(async () => {
  try {
    const result = await window.xiao.article.css(props.siteDir);
    if (result.ok) breakpoints.value = result.data.breakpoints ?? [];
  } catch {
    breakpoints.value = [];
  }
});

watch(
  () => props.siteDir,
  async () => {
    device.value = 'base';
    try {
      const result = await window.xiao.article.css(props.siteDir);
      if (result.ok) breakpoints.value = result.data.breakpoints ?? [];
    } catch {
      breakpoints.value = [];
    }
  },
);

function prefixed(value: string, deviceId: string): string {
  if (deviceId === 'base' || !value) return value;
  return value.replace(/^x-/, `x-${deviceId}-`);
}

function valueOf(key: string): string {
  if (device.value === 'base') return groupValue(props.classes, key);
  const group = TOKEN_GROUPS[key];
  if (!group) return '';
  const hit = group.options.find(
    (option) => option.value && props.classes.includes(prefixed(option.value, device.value)),
  );
  return hit?.value ?? '';
}

function change(key: string, value: string): void {
  if (device.value === 'base') {
    emit('change', key === 'cols' ? withColumnsValue(props.classes, value) : withGroupValue(props.classes, key, value));
    return;
  }
  const group = TOKEN_GROUPS[key];
  if (!group) return;
  const managed = new Set(
    group.options
      .map((option) => prefixed(option.value, device.value))
      .filter(Boolean),
  );
  const next = props.classes.filter((token) => !managed.has(token));
  const added = prefixed(value, device.value);
  if (added) next.push(added);
  if (key === 'cols' && added && !next.includes('x-grid')) next.push('x-grid');
  emit('change', [...new Set(next)]);
}
</script>

<template>
  <div class="page-style">
    <UiField v-if="breakpoints.length" label="断点" hint="断点样式覆盖基础样式，只写改动的项">
      <UiSelect v-model="device" :options="deviceOptions" size="sm" />
    </UiField>
    <div class="page-style__group">
      <p class="page-style__title">布局</p>
      <UiField
        v-for="key in layoutKeys"
        :key="key"
        :label="TOKEN_GROUPS[key]?.label ?? key"
      >
        <UiSelect
          :model-value="valueOf(key)"
          :options="TOKEN_GROUPS[key]?.options ?? []"
          size="sm"
          @update:model-value="change(key, String($event))"
        />
      </UiField>
    </div>
    <div class="page-style__group">
      <p class="page-style__title">外观</p>
      <UiField
        v-for="key in lookKeys"
        :key="key"
        :label="TOKEN_GROUPS[key]?.label ?? key"
      >
        <UiSelect
          :model-value="valueOf(key)"
          :options="TOKEN_GROUPS[key]?.options ?? []"
          size="sm"
          @update:model-value="change(key, String($event))"
        />
      </UiField>
    </div>
    <div class="page-style__group">
      <p class="page-style__title">文字</p>
      <UiField
        v-for="key in textKeys"
        :key="key"
        :label="TOKEN_GROUPS[key]?.label ?? key"
      >
        <UiSelect
          :model-value="valueOf(key)"
          :options="TOKEN_GROUPS[key]?.options ?? []"
          size="sm"
          @update:model-value="change(key, String($event))"
        />
      </UiField>
    </div>
    <p class="page-style__hint">
      组件自带的内边距/背景选项优先；这里补断点、外边距、跨列、圆角、阴影和文字样式。
    </p>
  </div>
</template>

<style scoped>
.page-style {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.page-style__group {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s2);
}

.page-style__title {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  letter-spacing: 0.04em;
}

.page-style__hint {
  margin: 0;
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: 1.6;
}
</style>
