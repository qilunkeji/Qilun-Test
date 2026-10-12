<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api, statusLabels } from '../logic/api';

type Resume = { id: string; source_id: string; version: number; filename: string; content_hash: string; completeness: string; created_at: string };
type Application = { id: string; job_id: string; title: string; job_version: number; batch: string; created_at: string };
type Assessment = { id: string; submitted_at: string | null; created_at: string; revoked_at: string | null };
type TalentDetail = { id: string; name: string; purpose: string; processing_basis: string; retention_until: string; created_at: string; project_group_id: string | null; sources: { id: string; channel: string; external_id: string; authorization_ref: string; created_at: string }[]; resumes: Resume[]; applications: Application[]; assessments: Assessment[] };

const route = useRoute();
const talent = ref<TalentDetail | null>(null);
const contact = ref<string | null>(null);
const showContact = ref(false);

async function load() {
  talent.value = await api<TalentDetail>(`/talents/${route.params.id}`);
}

async function viewContact() {
  try {
    const result = await api<{ contact: string | null }>(`/talents/${route.params.id}/contact-access`, {});
    contact.value = result.contact;
    showContact.value = true;
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}

onMounted(load);
</script>

<template>
  <div v-if="talent">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2>{{ talent.name }}</h2>
      <el-button @click="viewContact">查看联系方式</el-button>
    </div>
    <el-dialog v-model="showContact" :title="`${talent.name} 的联系方式`" width="400">
      <p v-if="contact" style="font-size: 18px; font-weight: 600; word-break: break-all">{{ contact }}</p>
      <p v-else style="color: #909399">未录入联系方式</p>
      <p style="color: #909399; font-size: 12px; margin-top: 12px">查看已记录审计日志</p>
    </el-dialog>

    <el-descriptions :column="3" border style="margin-bottom: 16px">
      <el-descriptions-item label="用途">{{ (statusLabels as Record<string, string>)[talent.purpose] ?? talent.purpose }}</el-descriptions-item>
      <el-descriptions-item label="保留至">{{ talent.retention_until }}</el-descriptions-item>
      <el-descriptions-item label="建档时间">{{ talent.created_at }}</el-descriptions-item>
      <el-descriptions-item label="处理依据" :span="3">{{ talent.processing_basis }}</el-descriptions-item>
    </el-descriptions>

    <h4>简历版本（{{ talent.resumes.length }}）</h4>
    <el-table :data="talent.resumes" size="small" style="margin-bottom: 16px">
      <el-table-column prop="version" label="版本" width="70" />
      <el-table-column prop="filename" label="文件" />
      <el-table-column prop="completeness" label="完整度" />
      <el-table-column prop="created_at" label="导入时间" />
    </el-table>

    <h4>申请记录（{{ talent.applications.length }}）</h4>
    <el-table :data="talent.applications" size="small" style="margin-bottom: 16px">
      <el-table-column prop="title" label="岗位" />
      <el-table-column prop="batch" label="批次" />
      <el-table-column prop="created_at" label="申请时间" />
    </el-table>

    <h4>测评记录（{{ talent.assessments.length }}）</h4>
    <el-table :data="talent.assessments" size="small">
      <el-table-column prop="id" label="测评ID" />
      <el-table-column prop="submitted_at" label="提交时间">
        <template #default="{ row }">{{ row.submitted_at ?? '未提交' }}</template>
      </el-table-column>
      <el-table-column prop="revoked_at" label="撤销时间">
        <template #default="{ row }">{{ row.revoked_at ?? '-' }}</template>
      </el-table-column>
    </el-table>
  </div>
</template>
