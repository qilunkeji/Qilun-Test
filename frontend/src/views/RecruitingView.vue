<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Material = { id: string; title: string; category: string; source_name: string; char_count: number; created_at: string };
const materials = ref<Material[]>([]);
const showCreate = ref(false);
const creating = ref(false);
const newMaterial = ref({ title: '', category: '公司介绍', source_name: '', content: '' });
const optimizeForm = ref({
  title: '', location: '', salary_min: null as number | null, salary_max: null as number | null,
  salary_months: 12, experience: '', education: '', style: '专业清晰', requirements: '', material_ids: [] as string[],
});
const optimizing = ref(false);
const optimizeResult = ref<{ findings: { kind: string; text: string }[]; unknowns: string[] } | null>(null);

async function loadMaterials() {
  const data = await api<{ items: Material[] }>('/recruiting/materials');
  materials.value = data.items;
}

async function createMaterial() {
  creating.value = true;
  try {
    await api('/recruiting/materials', newMaterial.value);
    ElMessage.success('资料已保存');
    showCreate.value = false;
    newMaterial.value = { title: '', category: '公司介绍', source_name: '', content: '' };
    await loadMaterials();
  } catch (e) { ElMessage.error((e as Error).message); } finally { creating.value = false; }
}

async function optimize() {
  optimizing.value = true;
  optimizeResult.value = null;
  try {
    const result = await api<{ id: string; status: string }>('/ai/run', { feature: 'job_optimize', recruiting: optimizeForm.value, authorized_to_send: true });
    ElMessage.info(`任务已提交（${result.id}），等待 AI 处理`);
  } catch (e) { ElMessage.error((e as Error).message); } finally { optimizing.value = false; }
}

async function archive(id: string) {
  await api(`/recruiting/materials/${id}/archive`, {});
  await loadMaterials();
}

onMounted(loadMaterials);
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2>招聘优化</h2>
      <el-button type="primary" @click="showCreate = true">新建资料</el-button>
    </div>

    <el-card style="margin-bottom: 16px">
      <template #header>岗位文案生成</template>
      <el-form label-position="top">
        <el-row :gutter="12">
          <el-col :span="8"><el-form-item label="岗位"><el-input v-model="optimizeForm.title" /></el-form-item></el-col>
          <el-col :span="8"><el-form-item label="地点"><el-input v-model="optimizeForm.location" /></el-form-item></el-col>
          <el-col :span="8">
            <el-form-item label="风格">
              <el-select v-model="optimizeForm.style">
                <el-option value="专业清晰" /><el-option value="有吸引力" /><el-option value="简洁直接" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="6"><el-form-item label="最低月薪"><el-input-number v-model="optimizeForm.salary_min" :min="0" :max="1000000" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="最高月薪"><el-input-number v-model="optimizeForm.salary_max" :min="0" :max="1000000" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="年薪月数"><el-input-number v-model="optimizeForm.salary_months" :min="12" :max="24" /></el-form-item></el-col>
          <el-col :span="6"><el-form-item label="经验"><el-input v-model="optimizeForm.experience" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="补充需求"><el-input v-model="optimizeForm.requirements" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="选择资料">
          <el-select v-model="optimizeForm.material_ids" multiple placeholder="选择参考资料">
            <el-option v-for="m in materials" :key="m.id" :value="m.id" :label="`${m.title} (${m.char_count}字)`" />
          </el-select>
        </el-form-item>
        <el-button type="primary" :loading="optimizing" @click="optimize">生成招聘文案</el-button>
      </el-form>
    </el-card>

    <h4>参考资料</h4>
    <el-table :data="materials" size="small">
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="category" label="分类" width="100" />
      <el-table-column prop="source_name" label="来源" />
      <el-table-column prop="char_count" label="字数" width="80" />
      <el-table-column prop="created_at" label="创建时间" />
      <el-table-column width="80">
        <template #default="{ row }">
          <el-button size="small" text type="danger" @click="archive(row.id)">归档</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreate" title="新建参考资料" width="600">
      <el-form label-position="top">
        <el-form-item label="标题" required><el-input v-model="newMaterial.title" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="newMaterial.category">
            <el-option value="公司介绍" /><el-option value="产品与业务" /><el-option value="团队与福利" />
            <el-option value="岗位参考" /><el-option value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源名称"><el-input v-model="newMaterial.source_name" /></el-form-item>
        <el-form-item label="内容" required><el-input v-model="newMaterial.content" type="textarea" :rows="8" /></el-form-item>
        <el-button type="primary" :loading="creating" @click="createMaterial" style="width: 100%">保存</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>
