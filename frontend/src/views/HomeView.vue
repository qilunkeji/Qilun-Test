<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../logic/api';

type Dashboard = { jobs: number; candidates: number; applications: number; expired: number };
const stats = ref<Dashboard | null>(null);

onMounted(async () => {
  stats.value = await api<Dashboard>('/dashboard');
});
</script>

<template>
  <div>
    <h2>首页</h2>
    <el-row :gutter="16" v-if="stats">
      <el-col :span="6"><el-card><el-statistic title="岗位" :value="stats.jobs" /></el-card></el-col>
      <el-col :span="6"><el-card><el-statistic title="在库人才" :value="stats.candidates" /></el-card></el-col>
      <el-col :span="6"><el-card><el-statistic title="申请" :value="stats.applications" /></el-card></el-col>
      <el-col :span="6"><el-card><el-statistic title="已到期" :value="stats.expired" /></el-card></el-col>
    </el-row>
  </div>
</template>
