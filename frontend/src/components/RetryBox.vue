<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: '读取失败，请重试。' });
const emit = defineEmits<{ (e: 'retry'): void }>();
</script>
<template>
  <div class="error-state" role="alert"><p>{{ text }}</p><button @click="emit('retry')">重新读取</button></div>
</template>
