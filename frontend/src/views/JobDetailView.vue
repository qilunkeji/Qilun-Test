<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../logic/api';

type JobVersion = { id: string; version: number; title: string; department: string; owner: string; location: string; tasks: string; criteria: string; public_jd: string; status: string; change_reason: string; created_at: string };
type JobDetail = { id: string; revision: number; created_at: string; versions: JobVersion[] };

const route = useRoute();
const job = ref<JobDetail | null>(null);

onMounted(async () => {
  job.value = await api<JobDetail>(`/jobs/${route.params.id}`);
});
</script>

<template>
  <div v-if="job">
    <h2>{{ job.versions[0]?.title ?? '岗位' }}（第 {{ job.revision }} 版）</h2>
    <el-tabs>
      <el-tab-pane v-for="v in job.versions" :key="v.id" :label="`v${v.version}`">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="部门">{{ v.department }}</el-descriptions-item>
          <el-descriptions-item label="负责人">{{ v.owner }}</el-descriptions-item>
          <el-descriptions-item label="地点">{{ v.location }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ v.status }}</el-descriptions-item>
          <el-descriptions-item label="职责" :span="2">{{ v.tasks }}</el-descriptions-item>
          <el-descriptions-item label="要求" :span="2">{{ v.criteria }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
