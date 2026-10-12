<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Config = { feature: string; provider: string; model: string; has_key: boolean; prompt: string; budget: number; input_price: number; output_price: number; updated_at: string };
type SettingsData = { features: Record<string, string>; configs: Config[]; providers: string[]; currency: string; pricing_unit: string; budget_scope: string };
const settings = ref<SettingsData | null>(null);
const showEdit = ref(false);
const editing = ref(false);
const form = ref({ feature: 'default', provider: 'deepseek', model: '', key: '', prompt: '', budget: 100, input_price: 1, output_price: 2 });

async function load() {
  settings.value = await api<SettingsData>('/ai/settings');
}

async function save() {
  editing.value = true;
  try {
    await api('/ai/settings', form.value);
    ElMessage.success('配置已保存');
    showEdit.value = false;
    await load();
  } catch (e) { ElMessage.error((e as Error).message); } finally { editing.value = false; }
}

async function inherit(feature: string) {
  await api('/ai/settings/inherit', { feature });
  ElMessage.success('已恢复默认');
  await load();
}

onMounted(load);
</script>

<template>
  <div v-if="settings">
    <h2>模型配置</h2>
    <el-alert :title="settings.budget_scope" type="info" show-icon :closable="false" style="margin-bottom: 16px" />
    <el-button type="primary" @click="showCreate = true; form.feature = 'default'" style="margin-bottom: 12px">配置默认模型</el-button>
    <el-table :data="settings.configs" size="small">
      <el-table-column prop="feature" label="功能" />
      <el-table-column prop="provider" label="供应商" width="100" />
      <el-table-column prop="model" label="模型" />
      <el-table-column prop="has_key" label="Key" width="60">
        <template #default="{ row }">
          <el-tag :type="row.has_key ? 'success' : 'danger'" size="small">{{ row.has_key ? '✓' : '✗' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="budget" label="预算" width="80" />
      <el-table-column prop="updated_at" label="更新时间" width="180" />
      <el-table-column width="80">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="inherit(row.feature)">恢复默认</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreate" title="配置模型" width="600">
      <el-form label-position="top">
        <el-form-item label="功能">
          <el-select v-model="form.feature">
            <el-option value="default" label="默认" />
            <el-option v-for="(title, key) in settings.features" :key="key" :value="key" :label="title" />
          </el-select>
        </el-form-item>
        <el-form-item label="供应商">
          <el-radio-group v-model="form.provider">
            <el-radio-button value="deepseek">DeepSeek</el-radio-button>
            <el-radio-button value="openai">OpenAI</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="模型名称" required><el-input v-model="form.model" placeholder="deepseek-chat / gpt-4o" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="form.key" type="password" show-password placeholder="留空则沿用已保存的 Key" /></el-form-item>
        <el-form-item label="提示词"><el-input v-model="form.prompt" type="textarea" :rows="4" /></el-form-item>
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="预算(USD)"><el-input-number v-model="form.budget" :min="1" :max="10000" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="输入价($/M)"><el-input-number v-model="form.input_price" :min="0.01" :max="10000" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="输出价($/M)"><el-input-number v-model="form.output_price" :min="0.01" :max="10000" /></el-form-item></el-col>
        </el-row>
        <el-button type="primary" :loading="editing" @click="save" style="width: 100%">保存</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>

<script lang="ts">
export default { name: 'ModelSettings' }
</script>
