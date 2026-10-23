<script setup lang="ts">
import { computed } from 'vue';
import { icons } from '../icons.ts';
import { notify } from '../notice.ts';
import { UiBadge, UiButton, UiDialog, UiIcon } from '../ui/index.ts';

/** Shell 依赖这个接口：props 与 choose 事件都不能改。 */
const props = defineProps<{ file: string; mine: string; disk: string; compare: boolean }>();
const emit = defineEmits<{ choose: [action: 'keep' | 'load' | 'compare'] }>();

/** 对比最多渲染这么多行，避免大文件把对话框拖慢。 */
const MAX_LINES = 2000;

function toLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n');
}

const mineLines = computed(() => toLines(props.mine));
const diskLines = computed(() => toLines(props.disk));

/** 近似差异：按行号逐行比对，用于摘要里的「约 N 行不同」，不做 LCS。 */
const diff = computed(() => {
  const mine = mineLines.value;
  const disk = diskLines.value;
  const max = Math.max(mine.length, disk.length);
  let changed = 0;
  for (let index = 0; index < max; index += 1) {
    if (mine[index] !== disk[index]) changed += 1;
  }
  return { changed, mine: mine.length, disk: disk.length };
});

const mineShown = computed(() => mineLines.value.slice(0, MAX_LINES));
const diskShown = computed(() => diskLines.value.slice(0, MAX_LINES));
const truncated = computed(() => diff.value.mine > MAX_LINES || diff.value.disk > MAX_LINES);

function isDiff(index: number): boolean {
  return mineLines.value[index] !== diskLines.value[index];
}

function choose(action: 'keep' | 'load' | 'compare'): void {
  emit('choose', action);
}

/** Esc / 关闭按钮不替用户做决定：提示一次，对话框继续保持打开。 */
function onDismiss(): void {
  notify('冲突还没解决：先选「保留我的修改」或「载入磁盘版本」。', 'info', 'conflict-dismiss');
}
</script>

<template>
  <UiDialog
    :model-value="true"
    :width="compare ? 900 : 520"
    title="文件在外面被改了"
    @update:model-value="onDismiss"
  >
    <div class="conflict">
      <p class="lead">编辑器里的内容还没保存，磁盘上的文件被别的程序改了。两个版本只能留一个，请先选。</p>

      <div class="file">
        <UiIcon :path="icons.posts" :size="16" />
        <code class="file-path">{{ file }}</code>
      </div>

      <div class="summary">
        <div class="version">
          <span class="version-name">我的修改</span>
          <span class="version-meta">{{ diff.mine }} 行</span>
        </div>
        <div class="version">
          <span class="version-name">磁盘上的版本</span>
          <span class="version-meta">{{ diff.disk }} 行</span>
        </div>
        <UiBadge tone="warn">约 {{ diff.changed }} 行不同</UiBadge>
      </div>

      <div v-if="compare" class="compare">
        <section class="pane" aria-label="我的修改">
          <header class="pane-head">
            <span>我的修改</span>
            <span class="pane-meta">{{ diff.mine }} 行</span>
          </header>
          <div class="code">
            <div
              v-for="(line, index) in mineShown"
              :key="`mine-${index}`"
              class="line"
              :class="{ 'is-diff': isDiff(index) }"
            >
              <span class="ln" aria-hidden="true">{{ index + 1 }}</span>
              <span class="text">{{ line }}</span>
            </div>
          </div>
        </section>
        <section class="pane" aria-label="磁盘上的版本">
          <header class="pane-head">
            <span>磁盘上的版本</span>
            <span class="pane-meta">{{ diff.disk }} 行</span>
          </header>
          <div class="code">
            <div
              v-for="(line, index) in diskShown"
              :key="`disk-${index}`"
              class="line"
              :class="{ 'is-diff': isDiff(index) }"
            >
              <span class="ln" aria-hidden="true">{{ index + 1 }}</span>
              <span class="text">{{ line }}</span>
            </div>
          </div>
        </section>
      </div>

      <p v-if="truncated" class="hint">文件较大，对比只显示前 {{ MAX_LINES }} 行。</p>
      <p v-else-if="!compare" class="hint">选「对比两版」可以逐行看两边差异。</p>

      <p class="caution">
        <UiIcon :path="icons.alert" :size="14" />
        <span>选择后另一版会被丢弃，这一步不能撤销。</span>
      </p>
    </div>

    <template #actions>
      <UiButton
        v-if="compare"
        variant="ghost"
        :icon-left="icons.code"
        disabled
      >
        正在对比
      </UiButton>
      <UiButton v-else variant="ghost" :icon-left="icons.code" @click="choose('compare')">
        对比两版
      </UiButton>
      <UiButton variant="default" :icon-left="icons.download" @click="choose('load')">
        载入磁盘版本
      </UiButton>
      <UiButton variant="primary" :icon-left="icons.save" @click="choose('keep')">
        保留我的修改
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.conflict {
  display: flex;
  flex-direction: column;
  gap: var(--ui-s3);
}

.lead {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-2);
  line-height: var(--ui-lh);
}

.file {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  padding: var(--ui-s2) var(--ui-s3);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-raise);
  color: var(--ui-text-2);
}

.file-path {
  min-width: 0;
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  overflow-wrap: anywhere;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-s2);
}

.version {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ui-s1);
  padding: var(--ui-s1) var(--ui-s2);
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-panel);
}

.version-name {
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
}

.version-meta {
  color: var(--ui-text);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
}

.compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-s3);
}

.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ui-line);
  border-radius: var(--ui-r-sm);
  background: var(--ui-bg);
}

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-s2);
  padding: var(--ui-s1) var(--ui-s3);
  border-bottom: 1px solid var(--ui-line);
  background: var(--ui-panel);
  color: var(--ui-text-2);
  font-size: var(--ui-fs-1);
}

.pane-meta {
  color: var(--ui-text-3);
  font-family: var(--ui-mono);
}

.code {
  max-height: 42vh;
  overflow: auto;
}

.line {
  display: flex;
  min-height: 18px;
  color: var(--ui-text-2);
  font-family: var(--ui-mono);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
  white-space: pre;
}

.line.is-diff {
  background: var(--ui-danger-weak);
  color: var(--ui-text);
}

.ln {
  flex: none;
  width: var(--ui-s7);
  padding-right: var(--ui-s2);
  color: var(--ui-text-3);
  text-align: right;
  user-select: none;
}

.text {
  flex: 1;
  min-width: 0;
  padding-right: var(--ui-s3);
}

.hint {
  color: var(--ui-text-3);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

.caution {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-s2);
  padding: var(--ui-s2) var(--ui-s3);
  border-radius: var(--ui-r-sm);
  background: var(--ui-warn-weak);
  color: var(--ui-warn);
  font-size: var(--ui-fs-1);
  line-height: var(--ui-lh);
}

@media (max-width: 780px) {
  .compare {
    grid-template-columns: minmax(0, 1fr);
  }

  .code {
    max-height: 26vh;
  }
}
</style>
