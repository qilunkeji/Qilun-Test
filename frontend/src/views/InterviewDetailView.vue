<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Run = { id: string; status: string; feature: string; result: unknown; error_code: string | null; created_at: string };
type InterviewDetail = {
  id: string; application_id: string; assessment_id: string | null;
  rubric: { name: string; requirement: string; weight: number }[];
  question_count: number; revision: number;
  transcript: string; runs: Run[];
  candidate_id: string; name: string; title: string; tasks: string; criteria: string; text_content: string;
};

const route = useRoute();
const detail = ref<InterviewDetail | null>(null);
const transcriptText = ref('');
const expectedRevision = ref(0);
const saving = ref(false);
const activeTab = ref('info');

async function load() {
  detail.value = await api<InterviewDetail>(`/interviews/${route.params.id}`);
  transcriptText.value = detail.value.transcript || '';
  expectedRevision.value = detail.value.revision;
}

async function saveTranscript() {
  saving.value = true;
  try {
    const result = await api<{ revision: number }>(`/interviews/${route.params.id}/transcript`, {
      text: transcriptText.value, expected_revision: expectedRevision.value, processing_confirmed: true,
    });
    expectedRevision.value = result.revision;
    ElMessage.success(`文稿已保存（版本 ${result.revision}）`);
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <div v-if="detail" style="max-width: 900px">
    <h2>{{ detail.name }} · {{ detail.title }}</h2>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="面试信息" name="info">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="候选人">{{ detail.name }}</el-descriptions-item>
          <el-descriptions-item label="岗位">{{ detail.title }}</el-descriptions-item>
          <el-descriptions-item label="题数">{{ detail.question_count }}</el-descriptions-item>
          <el-descriptions-item label="文稿版本">v{{ detail.revision }}</el-descriptions-item>
          <el-descriptions-item label="职责" :span="2">{{ detail.tasks }}</el-descriptions-item>
          <el-descriptions-item label="要求" :span="2">{{ detail.criteria }}</el-descriptions-item>
        </el-descriptions>
        <h4>评价标准</h4>
        <el-table :data="detail.rubric" size="small">
          <el-table-column prop="name" label="能力项" />
          <el-table-column prop="requirement" label="要求" />
          <el-table-column prop="weight" label="权重" width="80" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="面试转写" name="transcript">
        <el-input v-model="transcriptText" type="textarea" :rows="16" placeholder="粘贴面试转写文本（10-16000字）" />
        <el-button type="primary" :loading="saving" @click="saveTranscript" style="margin-top: 12px"
          :disabled="transcriptText.trim().length < 10">保存文稿</el-button>
      </el-tab-pane>
      <el-tab-pane label="AI 处理记录" name="runs">
        <el-table :data="detail.runs" size="small">
          <el-table-column prop="feature" label="功能" />
          <el-table-column prop="status" label="状态" />
          <el-table-column prop="error_code" label="错误" />
          <el-table-column prop="created_at" label="时间" />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="简历" name="resume">
        <pre style="white-space: pre-wrap; font-size: 13px; background: #f5f7fa; padding: 16px; border-radius: 4px; max-height: 500px; overflow-y: auto">{{ detail.text_content }}</pre>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
