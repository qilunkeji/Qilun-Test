<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, type Page, statusLabels } from '../logic/api';

type TalentRow = { id: string; name: string; purpose: string; retention_until: string; created_at: string; project_group_id: string | null };
const rows = ref<TalentRow[]>([]);
const total = ref(0);
const page = ref(1);

async function load() {
  const data = await api<Page<TalentRow>>(`/talents?page=${page.value}`);
  rows.value = data.items;
  total.value = data.total;
}
onMounted(load);
</script>

<template>
  <div>
    <h2>人才档案</h2>
    <el-table :data="rows">
      <el-table-column prop="name" label="姓名" />
      <el-table-column prop="purpose" label="用途">
        <template #default="{ row }">{{ (statusLabels as Record<string, string>)[row.purpose] ?? row.purpose }}</template>
      </el-table-column>
      <el-table-column prop="retention_until" label="保留至" />
      <el-table-column prop="created_at" label="建档时间" />
    </el-table>
    <el-pagination style="margin-top: 16px" layout="prev, pager, next" :total="total" :page-size="20" v-model:current-page="page" @current-change="load" />
  </div>
</template>
