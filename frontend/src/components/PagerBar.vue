<script setup lang="ts">
const props = defineProps<{ page: number; total: number }>();
const emit = defineEmits<{ (e: 'go', page: number): void }>();
function go(next: number) { if (next >= 1 && props.page * 20 < props.total + 20) emit('go', next); }
</script>
<template>
  <div class="pager">
    <span>共 {{ total }} 条 · 第 {{ page }} 页</span>
    <button :disabled="page === 1" @click="go(page - 1)">上一页</button>
    <button :disabled="page * 20 >= total" @click="go(page + 1)">下一页</button>
  </div>
</template>
