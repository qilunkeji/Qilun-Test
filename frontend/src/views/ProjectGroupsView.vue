<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Group = { id: string; name: string };
const groups = ref<Group[]>([]);
const newName = ref('');
const creating = ref(false);

async function load() {
  const data = await api<{ items: Group[] }>('/project-groups');
  groups.value = data.items;
}

async function create() {
  creating.value = true;
  try {
    await api('/project-groups', { name: newName.value });
    ElMessage.success('项目组已创建');
    newName.value = '';
    await load();
  } catch (e) { ElMessage.error((e as Error).message); } finally { creating.value = false; }
}

onMounted(load);
</script>

<template>
  <div style="max-width: 600px">
    <h2>项目组管理</h2>
    <div style="display: flex; gap: 8px; margin-bottom: 16px">
      <el-input v-model="newName" placeholder="新项目组名称" @keyup.enter="create" />
      <el-button type="primary" :loading="creating" :disabled="!newName" @click="create">创建</el-button>
    </div>
    <el-table :data="groups" size="small">
      <el-table-column prop="name" label="名称" />
    </el-table>
  </div>
</template>
