<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

const router = useRouter();
const loading = ref(false);
const form = ref({
  title: '', department: '', owner: '', location: '',
  tasks: '', criteria: '', public_jd: '',
  status: 'draft', change_reason: '',
});

async function create() {
  loading.value = true;
  try {
    const result = await api<{ id: string }>('/jobs', form.value);
    ElMessage.success('岗位已创建');
    router.push(`/jobs/${result.id}`);
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div style="max-width: 720px">
    <h2>创建岗位</h2>
    <el-form label-position="top">
      <el-row :gutter="16">
        <el-col :span="12"><el-form-item label="岗位名称" required><el-input v-model="form.title" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="部门" required><el-input v-model="form.department" /></el-form-item></el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="8"><el-form-item label="负责人" required><el-input v-model="form.owner" /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="地点" required><el-input v-model="form.location" /></el-form-item></el-col>
        <el-col :span="8">
          <el-form-item label="状态">
            <el-select v-model="form.status">
              <el-option value="draft" label="草稿" />
              <el-option value="pending" label="待确认" />
              <el-option value="open" label="招聘中" />
              <el-option value="paused" label="暂停" />
              <el-option value="closed" label="关闭" />
              <el-option value="archived" label="归档" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="职责" required><el-input v-model="form.tasks" type="textarea" :rows="4" /></el-form-item>
      <el-form-item label="要求" required><el-input v-model="form.criteria" type="textarea" :rows="4" /></el-form-item>
      <el-form-item label="公开JD"><el-input v-model="form.public_jd" type="textarea" :rows="6" /></el-form-item>
      <el-form-item label="变更原因"><el-input v-model="form.change_reason" /></el-form-item>
      <el-button type="primary" :loading="loading" @click="create" style="width: 100%">创建岗位</el-button>
    </el-form>
  </div>
</template>
