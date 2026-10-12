<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../logic/api';

type InterviewRow = { id: string; created_at: string; revision: number; name: string; title: string };
const rows = ref<InterviewRow[]>([]);
onMounted(async () => {
  const data = await api<{ items: InterviewRow[] }>('/interviews');
  rows.value = data.items;
});
</script>

<template>
  <div>
    <h2>面试评估</h2>
    <el-table :data="rows" @row-click="(row: any) => $router.push(`/interviews/${row.id}`)">
      <el-table-column prop="name" label="候选人" />
      <el-table-column prop="title" label="岗位" />
      <el-table-column prop="revision" label="文稿版本" width="100" />
      <el-table-column prop="created_at" label="创建时间" />
    </el-table>
  </div>
</template>
