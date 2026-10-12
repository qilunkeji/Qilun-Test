<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Grant = { id: string; extension_id: string; expires_at: string; revoked_at: string | null; created_at: string };
const grants = ref<Grant[]>([]);
const newToken = ref('');
const showToken = ref(false);
const extensionId = ref('');
const creating = ref(false);

async function load() {
  const data = await api<{ items: Grant[] }>('/resume-extension/grants');
  grants.value = data.items;
}

async function createGrant() {
  creating.value = true;
  try {
    const result = await api<{ token: string; expires_in_seconds: number }>('/resume-extension/grants', { extension_id: extensionId.value });
    newToken.value = result.token;
    showToken.value = true;
    await load();
  } catch (e) { ElMessage.error((e as Error).message); } finally { creating.value = false; }
}

async function revoke(id: string) {
  await api(`/resume-extension/grants/${id}/revoke`, {});
  ElMessage.success('已撤销');
  await load();
}

onMounted(load);
</script>

<template>
  <div style="max-width: 700px">
    <h2>浏览器扩展授权</h2>
    <el-card style="margin-bottom: 16px">
      <el-form inline>
        <el-form-item label="扩展ID">
          <el-input v-model="extensionId" placeholder="32位扩展标识 (a-p)" style="width: 300px" />
        </el-form-item>
        <el-button type="primary" :loading="creating" :disabled="extensionId.length !== 32" @click="createGrant">生成授权</el-button>
      </el-form>
    </el-card>

    <el-dialog v-model="showToken" title="授权令牌（仅显示一次）" width="500">
      <el-alert type="warning" show-icon :closable="false" title="令牌只显示这一次，请立即复制到扩展中。有效期 1 小时。" style="margin-bottom: 12px" />
      <el-input :model-value="newToken" readonly>
        <template #append>
          <el-button @click="navigator.clipboard.writeText(newToken)">复制</el-button>
        </template>
      </el-input>
    </el-dialog>

    <el-table :data="grants" size="small">
      <el-table-column prop="extension_id" label="扩展ID" />
      <el-table-column prop="created_at" label="创建时间" />
      <el-table-column prop="expires_at" label="过期时间" />
      <el-table-column prop="revoked_at" label="状态">
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
  </div>
</template>
