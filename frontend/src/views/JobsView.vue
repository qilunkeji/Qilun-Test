<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api, type Page } from '../logic/api';
import { statusLabels } from '../logic/api';

type JobRow = { id: string; revision: number; title: string; department: string; owner: string; location: string; status: string; version_id: string; created_at: string };
const router = useRouter();
const rows = ref<JobRow[]>([]);
const total = ref(0);
const page = ref(1);

async function load() {
  const data = await api<Page<JobRow>>(`/jobs?page=${page.value}`);
  rows.value = data.items;
  total.value = data.total;
}
onMounted(load);
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center">
      <h2>岗位管理</h2>
    </div>
    <el-table :data="rows" @row-click="(row: JobRow) => router.push(`/jobs/${row.id}`)">
      <el-table-column prop="title" label="岗位" />
      <el-table-column prop="department" label="部门" />
      <el-table-column prop="owner" label="负责人" />
      <el-table-column prop="location" label="地点" />
      <el-table-column prop="status" label="状态">
        <template #default="{ row }">{{ (statusLabels as Record<string, string>)[row.status] ?? row.status }}</template>
      </el-table-column>
      <el-table-column prop="revision" label="版本" width="80" />
    </el-table>
    <el-pagination style="margin-top: 16px" layout="prev, pager, next" :total="total" :page-size="20" v-model:current-page="page" @current-change="load" />
  </div>
</template>
