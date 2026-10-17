<script setup lang="ts">
import { copy } from '../copy.ts';

defineProps<{ file: string; mine: string; disk: string; compare: boolean }>();
const emit = defineEmits<{ choose: [action: 'keep' | 'load' | 'compare'] }>();
</script>

<template>
  <section class="conflict">
    <p>{{ copy.conflictLead }} {{ file }}</p>
    <button type="button" @click="emit('choose', 'keep')">{{ copy.keepMine }}</button>
    <button type="button" @click="emit('choose', 'load')">{{ copy.loadDisk }}</button>
    <button type="button" @click="emit('choose', 'compare')">{{ copy.compare }}</button>
    <div v-if="compare" class="compare">
      <pre>{{ mine }}</pre>
      <pre>{{ disk }}</pre>
    </div>
  </section>
</template>
