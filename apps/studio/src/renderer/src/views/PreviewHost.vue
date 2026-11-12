<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSession } from '../stores/session.ts';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DockDetail {
  enabled: boolean;
  url: string;
  device: 'phone' | 'tablet' | 'pc' | 'side';
  bounds: Bounds;
  zoom?: number;
  interactive?: boolean;
}

interface EditorDetail {
  url: string;
  bounds: Bounds | null;
  interactive?: boolean;
}

interface FrameBox {
  name: string;
  url: string;
  style: Record<string, string>;
}

const widths = { phone: 390, tablet: 820, pc: 1280 } as const;
const session = useSession();
const lanes = ref<FrameBox[]>([]);
const editor = ref<FrameBox | null>(null);

function boxStyle(x: number, y: number, width: number, height: number): Record<string, string> {
  return {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    border: '0',
    background: '#fff',
    zIndex: '5',
  };
}

function clearAll(): void {
  lanes.value = [];
  editor.value = null;
}

function onDock(event: Event): void {
  const detail = (event as CustomEvent<DockDetail>).detail;
  if (!session.siteDir || !detail?.enabled || !detail.url || !detail.bounds) {
    lanes.value = [];
    return;
  }
  const bounds = detail.bounds;
  if (bounds.width < 120 || bounds.height < 120) {
    lanes.value = [];
    return;
  }
  const devices: Array<'phone' | 'tablet' | 'pc'> =
    detail.device === 'side'
      ? ['phone', 'tablet', 'pc']
      : [detail.device === 'phone' || detail.device === 'tablet' ? detail.device : 'pc'];
  const requested = devices.map((device) => widths[device]);
  const sum = requested.reduce((total, width) => total + width, 0);
  const scale = detail.device === 'side' ? Math.min(1, bounds.width / sum) : 1;
  const limitRight = bounds.x + bounds.width;
  let nextX = bounds.x;
  const next: FrameBox[] = [];
  const pending: Promise<unknown>[] = [];
  devices.forEach((device, index) => {
    const natural = requested[index] ?? widths.pc;
    const share = detail.device === 'side' ? Math.floor(natural * scale) : Math.min(natural, bounds.width);
    const x = detail.device === 'side' ? nextX : bounds.x + Math.max(0, bounds.width - share) / 2;
    const width = Math.round(Math.max(0, Math.min(share, limitRight - x)));
    const height = Math.round(Math.max(0, bounds.height));
    nextX = x + width;
    if (width < 1 || height < 1) return;
    const name = `xiao-preview-dock-${index}`;
    const previous = lanes.value.find((lane) => lane.name === name);
    const url = previous?.url === detail.url ? previous.url : detail.url;
    pending.push(window.xiao.preview.expect(name, url));
    next.push({
      name,
      url,
      style: boxStyle(Math.round(x), Math.round(bounds.y), width, height),
    });
  });
  void Promise.all(pending).then(() => {
    lanes.value = next;
  });
}

function onEditor(event: Event): void {
  const detail = (event as CustomEvent<EditorDetail>).detail;
  if (!session.siteDir || !detail?.url || !detail.bounds) {
    editor.value = null;
    return;
  }
  const bounds = detail.bounds;
  if (bounds.width < 40 || bounds.height < 40) {
    editor.value = null;
    return;
  }
  const url = editor.value?.url === detail.url ? editor.value.url : detail.url;
  const frame = {
    name: 'xiao-preview-editor',
    url,
    style: boxStyle(
      Math.round(bounds.x),
      Math.round(bounds.y),
      Math.round(bounds.width),
      Math.round(bounds.height),
    ),
  };
  void window.xiao.preview.expect(frame.name, url).then(() => {
    editor.value = frame;
  });
}

function onHideDock(): void {
  lanes.value = [];
}

onMounted(() => {
  document.addEventListener('xiao:preview-dock', onDock);
  document.addEventListener('xiao:preview-editor', onEditor);
  document.addEventListener('xiao:preview-hide-dock', onHideDock);
});

onBeforeUnmount(() => {
  document.removeEventListener('xiao:preview-dock', onDock);
  document.removeEventListener('xiao:preview-editor', onEditor);
  document.removeEventListener('xiao:preview-hide-dock', onHideDock);
  clearAll();
});

watch(
  () => session.siteDir,
  (dir) => {
    if (!dir) clearAll();
  },
);
</script>

<template>
  <template v-if="session.siteDir">
    <iframe
      v-for="lane in lanes"
      :key="lane.name"
      :name="lane.name"
      :src="lane.url"
      :style="lane.style"
      title="页面预览"
    />
    <iframe
      v-if="editor"
      :key="editor.name"
      :name="editor.name"
      :src="editor.url"
      :style="editor.style"
      title="文章预览"
    />
  </template>
</template>
