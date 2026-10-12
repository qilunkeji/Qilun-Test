<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Assessment = { id: string; title: string; submitted_at: string };
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const assessments = ref<Assessment[]>([]);
const form = ref({
  application_id: (route.params.applicationId as string) || '',
  assessment_id: null as string | null,
  question_count: 10 as 10 | 20,
  rubric: [{ name: '', requirement: '', weight: 50 }],
});

onMounted(async () => {
  if (form.value.application_id) {
    const data = await api<{ items: Assessment[] }>(`/interviews/assessments/${form.value.application_id}`);
    assessments.value = data.items;
  }
});

function addCriterion() {
  if (form.value.rubric.length < 6) form.value.rubric.push({ name: '', requirement: '', weight: 10 });
}

function removeCriterion(i: number) {
  if (form.value.rubric.length > 1) form.value.rubric.splice(i, 1);
}

async function create() {
  loading.value = true;
  try {
    await api('/interviews', form.value);
    ElMessage.success('面试已创建');
    router.push('/interviews');
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div style="max-width: 720px">
    <h2>创建面试评估</h2>
    <el-form label-position="top">
      <el-form-item label="岗位申请ID" required>
        <el-input v-model="form.application_id" placeholder="UUID" />
      </el-form-item>
      <el-form-item label="关联测评（可选）">
        <el-select v-model="form.assessment_id" clearable placeholder="选择该人员的已提交测评">
          <el-option v-for="a in assessments" :key="a.id" :value="a.id" :label="`${a.title} (${a.submitted_at})`" />
        </el-select>
      </el-form-item>
      <el-form-item label="问题数量">
        <el-radio-group v-model="form.question_count">
          <el-radio-button :value="10">10 题</el-radio-button>
          <el-radio-button :value="20">20 题</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <h4>评价标准</h4>
      <div v-for="(item, i) in form.rubric" :key="i" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center">
        <el-input v-model="item.name" placeholder="能力项" style="width: 150px" />
        <el-input v-model="item.requirement" placeholder="要求" style="flex: 1" />
        <el-input-number v-model="item.weight" :min="1" :max="100" style="width: 120px" />
        <el-button @click="removeCriterion(i)" :disabled="form.rubric.length === 1" circle size="small">−</el-button>
      </div>
      <el-button @click="addCriterion" size="small" style="margin-bottom: 16px">添加能力项</el-button>
      <el-button type="primary" :loading="loading" @click="create" style="width: 100%">创建面试</el-button>
    </el-form>
  </div>
</template>
