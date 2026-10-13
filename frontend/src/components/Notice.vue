<script setup lang="ts">
defineProps<{ kind?: string }>();
</script>
<template>
  <div class="notice" :class="kind" :role="kind === 'error' ? 'alert' : 'status'"><slot /></div>
</template>
