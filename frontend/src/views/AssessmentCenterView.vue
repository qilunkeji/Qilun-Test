<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api, type Page } from '../logic/api';

type InviteRow = { id: string; name: string; title: string; version: string; purpose: string; expires_at: string; submitted_at: string | null; participant_kind: string; created_at: string };
type InviteList = Page<InviteRow> & { h5_origin: string; standard_assessment_available: boolean; standard_assessment_version: string };

const list = ref<InviteList | null>(null);
const creating = ref(false);
const purpose = ref('人才发展沟通');
const days = ref(7);

async function load() {
  list.value = await api<InviteList>('/assessment/invites');
}

async function createInvite() {
  creating.value = true;
  try {
    const created = await api<{ id: string; url: string; expires_at: string }>('/assessment/invites', { purpose: purpose.value, days: days.value });
    ElMessage.success(`测评链接已创建：${created.url}`);
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    creating.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div>
    <h2>测评中心</h2>
    <el-card style="margin-bottom: 16px">
      <el-form inline>
        <el-form-item label="用途"><el-input v-model="purpose" style="width: 280px" /></el-form-item>
        <el-form-item label="有效天数"><el-input-number v-model="days" :min="1" :max="30" /></el-form-item>
        <el-button type="primary" :loading="creating" @click="createInvite">创建测评链接</el-button>
      </el-form>
    </el-card>
    <el-table :data="list?.items ?? []">
      <el-table-column prop="name" label="参与者" />
      <el-table-column prop="title" label="测评" />
      <el-table-column prop="purpose" label="用途" />
      <el-table-column prop="participant_kind" label="类型" width="90" />
      <el-table-column prop="submitted_at" label="提交时间">
        <template #default="{ row }">{{ row.submitted_at ?? '未提交' }}</template>
      </el-table-column>
      <el-table-column prop="expires_at" label="到期" />
    </el-table>
  </div>
</template>
