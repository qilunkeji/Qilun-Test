<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Entry = { id: string; title: string; purpose: string; project_group_id: string | null; expires_at: string; revoked_at: string | null; created_at: string; participants: number; completed: number };
const entries = ref<Entry[]>([]);
const showCreate = ref(false);
const creating = ref(false);
const form = ref({ title: '', purpose: '', days: 7 });

async function load() {
  const data = await api<{ items: Entry[] }>('/assessment/public-entries');
  entries.value = data.items;
}

async function create() {
  creating.value = true;
  try {
    const result = await api<{ url: string }>('/assessment/public-entries', form.value);
    ElMessage.success(`链接已创建：${result.url}`);
    navigator.clipboard.writeText(result.url).catch(() => {});
    showCreate.value = false;
    form.value = { title: '', purpose: '', days: 7 };
    await load();
  } catch (e) { ElMessage.error((e as Error).message); } finally { creating.value = false; }
}

async function revoke(id: string) {
  await api(`/assessment/public-entries/${id}/revoke`, {});
  ElMessage.success('已撤销');
  await load();
}

onMounted(load);
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2>公共测评入口管理</h2>
      <el-button type="primary" @click="showCreate = true">创建入口</el-button>
    </div>
    <el-table :data="entries" size="small">
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="purpose" label="用途" />
      <el-table-column prop="participants" label="参与人数" width="90" />
      <el-table-column prop="completed" label="已提交" width="70" />
      <el-table-column prop="expires_at" label="到期" width="180" />
      <el-table-column label="状态" width="70">
        <template #default="{ row }">
          <el-tag :type="row.revoked_at ? 'danger' : 'success'" size="small">{{ row.revoked_at ? '已撤销' : '有效' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column width="80">
        <template #default="{ row }">
          <el-button v-if="!row.revoked_at" size="small" text type="danger" @click="revoke(row.id)">撤销</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreate" title="创建公共测评入口" width="500">
      <el-form label-position="top">
        <el-form-item label="标题" required><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="用途" required><el-input v-model="form.purpose" /></el-form-item>
        <el-form-item label="有效天数"><el-input-number v-model="form.days" :min="1" :max="30" /></el-form-item>
        <el-button type="primary" :loading="creating" @click="create" style="width: 100%">创建</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>
