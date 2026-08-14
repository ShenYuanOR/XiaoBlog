<script setup lang="ts">
import { computed } from 'vue'
import { groupByDate, groupByTag, groupByCategory } from '../data'
import { data as posts } from '../posts.data'

const props = defineProps<{ type: string }>()

const title = computed(() => (props.type === 'archives' ? '归档' : props.type === 'tags' ? '标签' : '分类'))
const desc = computed(() =>
  props.type === 'archives'
    ? '全部文章按时间归档。'
    : props.type === 'tags'
      ? '全部文章按标签聚合。'
      : '全部文章按分类聚合。',
)

function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${y} 年 ${m} 月`
}

function formatDay(date: string): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <div>
    <h1 class="x-page-title">{{ title }}</h1>
    <p class="x-page-desc">{{ desc }}</p>

    <!-- 归档：按年/月时间线 -->
    <template v-if="type === 'archives'">
      <template v-for="year in groupByDate(posts)" :key="year.year">
        <h2 class="x-archive-year">{{ year.year }}</h2>
        <template v-for="m in year.months" :key="m.month">
          <h3 class="x-archive-month">{{ formatMonth(m.month) }}</h3>
          <ul>
            <li v-for="post in m.posts" :key="post.slug" class="x-archive-item">
              <time :datetime="post.date">{{ formatDay(post.date) }}</time>
              <a :href="post.url">{{ post.title }}</a>
            </li>
          </ul>
        </template>
      </template>
    </template>

    <!-- 标签：聚合列表 -->
    <template v-else-if="type === 'tags'">
      <template v-for="g in groupByTag(posts)" :key="g.name">
        <h2 class="x-group-head" :id="g.name">
          {{ g.name }}<span class="x-badge">{{ g.posts.length }}</span>
        </h2>
        <ul class="x-group-list">
          <li v-for="post in g.posts" :key="post.slug">
            <a :href="post.url">{{ post.title }}</a>
          </li>
        </ul>
      </template>
    </template>

    <!-- 分类：聚合列表 -->
    <template v-else-if="type === 'categories'">
      <template v-for="g in groupByCategory(posts)" :key="g.name">
        <h2 class="x-group-head" :id="g.name">
          {{ g.name }}<span class="x-badge">{{ g.posts.length }}</span>
        </h2>
        <ul class="x-group-list">
          <li v-for="post in g.posts" :key="post.slug">
            <a :href="post.url">{{ post.title }}</a>
          </li>
        </ul>
      </template>
    </template>
  </div>
</template>
