<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

const router = useRouter();
const loading = ref(false);
const form = ref({
  name: '', purpose: 'recruitment' as 'recruitment' | 'talent_pool',
  processing_basis: '', channel: 'manual', external_id: '',
  authorization_ref: '', filename: 'import.txt',
  text_content: '', completeness: 'full' as 'full' | 'summary_only',
  contact: '', retention_until: '',
});

async function doImport() {
  loading.value = true;
  try {
    const result = await api<{ candidate_id: string; resume_version_id: string; version: number; duplicate: boolean }>('/talents/imports', form.value);
    ElMessage.success(result.duplicate ? `重复导入（版本 v${result.version}）` : `导入成功 v${result.version}`);
    router.push('/talents');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div style="max-width: 720px">
    <h2>导入简历</h2>
    <el-form label-position="top">
      <el-row :gutter="16">
        <el-col :span="8"><el-form-item label="姓名" required><el-input v-model="form.name" /></el-form-item></el-col>
        <el-col :span="8">
          <el-form-item label="用途">
            <el-select v-model="form.purpose">
              <el-option value="recruitment" label="当前招聘" />
              <el-option value="talent_pool" label="授权储备" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="完整度">
            <el-select v-model="form.completeness">
              <el-option value="full" label="完整材料" />
              <el-option value="summary_only" label="摘要资料" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="8"><el-form-item label="渠道" required><el-input v-model="form.channel" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="来源编号" required><el-input v-model="form.external_id" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="联系方式"><el-input v-model="form.contact" placeholder="可选" /></el-form-item></el-col>
      </el-row>
      <el-form-item label="处理依据" required><el-input v-model="form.processing_basis" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="授权记录"><el-input v-model="form.authorization_ref" /></el-form-item>
      <el-form-item label="保留至" required>
        <el-date-picker v-model="form.retention_until" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" style="width: 100%" />
      </el-form-item>
      <el-form-item label="简历文本（UTF-8 TXT 或粘贴）" required>
        <el-input v-model="form.text_content" type="textarea" :rows="10" placeholder="粘贴简历全文，或导入 .txt 文件内容" />
      </el-form-item>
      <el-button type="primary" :loading="loading" @click="doImport" style="width: 100%" :disabled="!form.name || !form.text_content || !form.retention_until">导入</el-button>
    </el-form>
  </div>
</template>
