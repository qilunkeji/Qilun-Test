<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, type Page } from '../logic/api';

type ResumeRow = { id: string; candidate_id: string; version: number; filename: string; completeness: string; created_at: string; name: string; channel: string };
const rows = ref<ResumeRow[]>([]);
const total = ref(0);
const page = ref(1);

async function load() {
  const data = await api<Page<ResumeRow>>(`/resume-library?page=${page.value}`);
  rows.value = data.items;
  total.value = data.total;
}
onMounted(load);
</script>

<template>
  <div>
    <h2>简历库</h2>
    <el-table :data="rows">
      <el-table-column prop="name" label="人才" />
      <el-table-column prop="filename" label="文件" />
      <el-table-column prop="channel" label="渠道" />
      <el-table-column prop="version" label="版本" width="80" />
      <el-table-column prop="completeness" label="完整度" />
      <el-table-column prop="created_at" label="导入时间" />
    </el-table>
    <el-pagination style="margin-top: 16px" layout="prev, pager, next" :total="total" :page-size="20" v-model:current-page="page" @current-change="load" />
  </div>
</template>
