<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '正在读取…' });
</script>
<template>
  <div class="loading-state" role="status" aria-busy="true">{{ text }}</div>
</template>
