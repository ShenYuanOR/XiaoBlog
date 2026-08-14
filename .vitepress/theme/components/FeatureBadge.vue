<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <span class="x-hero-badge">{{ text }}</span>
</template>
