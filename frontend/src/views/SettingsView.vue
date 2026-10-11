<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../logic/api';

type Meta = { mode: string; processing_label: string; consent_text: string; reply_hint: string; agent_configured: boolean };
const meta = ref<Meta | null>(null);
const health = ref<{ assessment: { ready: boolean; version: string }; database: string } | null>(null);

onMounted(async () => {
  meta.value = await api<Meta>('/ai/meta');
  health.value = await api<{ assessment: { ready: boolean; version: string }; database: string }>('/health');
});
</script>

<template>
  <div>
    <h2>设置</h2>
    <el-descriptions :column="1" border v-if="meta && health">
      <el-descriptions-item label="处理模式">{{ meta.processing_label }}（{{ meta.mode }}）</el-descriptions-item>
      <el-descriptions-item label="智能体已配置">{{ meta.agent_configured ? '是' : '否' }}</el-descriptions-item>
      <el-descriptions-item label="测评引擎">{{ health.assessment.ready ? `就绪（${health.assessment.version}）` : '不可用' }}</el-descriptions-item>
      <el-descriptions-item label="数据库">{{ health.database }}</el-descriptions-item>
    </el-descriptions>
  </div>
</template>
