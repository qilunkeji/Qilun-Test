<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../logic/api';

type PendingTask = { task_id: string; task_type: string; state: string; created_at: string };
type Pending = { pending_count: number; oldest_queued_seconds: number; items: PendingTask[] };
const pending = ref<Pending | null>(null);
const meta = ref<{ processing_label: string; reply_hint: string } | null>(null);

onMounted(async () => {
  meta.value = await api<{ processing_label: string; reply_hint: string }>('/ai/meta');
  pending.value = await api<Pending>('/ai/pending');
});
</script>

<template>
  <div>
    <h2>AI 中心</h2>
    <el-descriptions :column="2" border v-if="meta && pending" style="margin-bottom: 16px">
      <el-descriptions-item label="处理方式">{{ meta.processing_label }}</el-descriptions-item>
      <el-descriptions-item label="预计耗时">{{ meta.reply_hint }}</el-descriptions-item>
      <el-descriptions-item label="待处理任务">{{ pending.pending_count }}</el-descriptions-item>
      <el-descriptions-item label="最长等待">{{ pending.oldest_queued_seconds }} 秒</el-descriptions-item>
    </el-descriptions>
    <el-table :data="pending?.items ?? []">
      <el-table-column prop="task_type" label="任务类型" />
      <el-table-column prop="state" label="状态" />
      <el-table-column prop="created_at" label="创建时间" />
    </el-table>
  </div>
</template>
