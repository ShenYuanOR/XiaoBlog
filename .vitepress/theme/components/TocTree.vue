<script setup lang="ts">
export interface TocNode {
  level: number
  title: string
  slug: string
  link: string
  children: TocNode[]
}

defineOptions({ name: 'TocTree' })

defineProps<{
  nodes: TocNode[]
  activeLink: string
  expanded: Set<string>
  nested?: boolean
}>()

const emit = defineEmits<{
  toggle: [link: string, event: Event]
}>()

function onToggle(link: string, event: Event) {
  emit('toggle', link, event)
}
</script>

<template>
  <ul class="x-toc-list" :class="nested ? 'x-toc-list-nested' : 'x-toc-list-root'">
    <li
      v-for="node in nodes"
      :key="node.link"
      class="x-toc-item"
      :class="{
        'is-active': activeLink === node.link,
        'has-children': node.children.length > 0,
        'is-open': expanded.has(node.link),
      }"
    >
      <div class="x-toc-row">
        <button
          v-if="node.children.length"
          type="button"
          class="x-toc-toggle"
          :aria-expanded="expanded.has(node.link) ? 'true' : 'false'"
          :aria-label="expanded.has(node.link) ? '折叠子章节' : '展开子章节'"
          @click="onToggle(node.link, $event)"
        >
          <span class="x-toc-caret" aria-hidden="true" />
        </button>
        <span v-else class="x-toc-toggle x-toc-toggle-spacer" aria-hidden="true" />
        <a
          class="x-toc-link"
          :class="{ active: activeLink === node.link }"
          :href="node.link"
          :title="node.title"
        >{{ node.title }}</a>
      </div>
      <TocTree
        v-if="node.children.length && expanded.has(node.link)"
        :nodes="node.children"
        :active-link="activeLink"
        :expanded="expanded"
        nested
        @toggle="onToggle"
      />
    </li>
  </ul>
</template>
