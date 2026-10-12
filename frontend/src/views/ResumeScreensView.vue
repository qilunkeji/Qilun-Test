<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Batch = { id: string; created_at: string; title: string; count: number };
type ScreenItem = { id: string; status: string; error_code: string | null; version: number; name: string; result: unknown; review: string | null; review_note: string | null };
type BatchDetail = { id: string; title: string; requirements: string; created_at: string; round: number; items: ScreenItem[]; review_history: { item_id: string; review: string; note: string; round: number; created_at: string }[] };
type JobRow = { id: string; version_id: string; title: string };

const router = useRouter();
const batches = ref<Batch[]>([]);
const jobs = ref<JobRow[]>([]);
const selected = ref<BatchDetail | null>(null);
const showCreate = ref(false);
const creating = ref(false);
const form = ref({ job_version_id: '', requirements: '', resume_ids: [] as string[] });
type ResumeRow = { id: string; name: string };
const resumes = ref<ResumeRow[]>([]);

async function loadBatches() {
  const data = await api<{ items: Batch[] }>('/resume-screens');
  batches.value = data.items;
}
async function loadJobs() {
  const data = await api<{ items: JobRow[] }>('/jobs');
  jobs.value = data.items;
}
async function loadResumes() {
  const data = await api<{ items: ResumeRow[] }>('/resume-library?page_size=100');
  resumes.value = data.items;
}
async function openDetail(id: string) {
  selected.value = await api<BatchDetail>(`/resume-screens/${id}`);
}
async function createBatch() {
  creating.value = true;
  try {
    await api('/resume-screens', { ...form.value, authorized_to_send: true });
    ElMessage.success('筛选批次已创建，等待 AI 处理');
    showCreate.value = false;
    await loadBatches();
  } catch (e) { ElMessage.error((e as Error).message); } finally { creating.value = false; }
}

onMounted(() => { loadBatches(); loadJobs(); loadResumes(); });
</script>

<template>
  <div>
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
      <h2>简历智能筛选</h2>
      <el-button type="primary" @click="showCreate = true">创建筛选批次</el-button>
    </div>
    <el-table :data="batches" @row-click="(row: any) => openDetail(row.id)" style="cursor: pointer">
      <el-table-column prop="created_at" label="创建时间" width="180" />
      <el-table-column prop="title" label="岗位" />
      <el-table-column prop="count" label="简历数" width="80" />
    </el-table>

    <el-drawer v-model="selected" :title="selected?.title ?? '筛选详情'" size="60%">
      <template v-if="selected">
        <el-descriptions :column="2" border style="margin-bottom: 16px">
          <el-descriptions-item label="岗位">{{ selected.title }}</el-descriptions-item>
          <el-descriptions-item label="轮次">第 {{ selected.round }} 轮</el-descriptions-item>
          <el-descriptions-item label="筛选要求" :span="2">{{ selected.requirements }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="selected.items" size="small">
          <el-table-column prop="name" label="人才" />
          <el-table-column prop="status" label="AI状态" width="100" />
          <el-table-column prop="review" label="人工审核" width="100">
            <template #default="{ row }">{{ row.review ?? '待审' }}</template>
          </el-table-column>
        </el-table>
        <h4 v-if="selected.review_history.length">审核历史</h4>
        <el-timeline v-if="selected.review_history.length">
          <el-timeline-item v-for="h in selected.review_history" :key="h.item_id + h.created_at" :timestamp="h.created_at">
            {{ h.review }} — {{ h.note }}
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-drawer>

    <el-dialog v-model="showCreate" title="创建筛选批次" width="600">
      <el-form label-position="top">
        <el-form-item label="选择岗位版本">
          <el-select v-model="form.job_version_id" filterable>
            <el-option v-for="j in jobs" :key="j.version_id" :value="j.version_id" :label="j.title" />
          </el-select>
        </el-form-item>
        <el-form-item label="筛选要求">
          <el-input v-model="form.requirements" type="textarea" :rows="3" placeholder="例如：三年以上后端经验，熟悉PostgreSQL" />
        </el-form-item>
        <el-form-item label="选择简历">
          <el-select v-model="form.resume_ids" multiple filterable>
            <el-option v-for="r in resumes" :key="r.id" :value="r.id" :label="r.name" />
          </el-select>
        </el-form-item>
        <el-button type="primary" :loading="creating" @click="createBatch" style="width: 100%" :disabled="!form.job_version_id || !form.requirements || form.resume_ids.length === 0">提交筛选</el-button>
      </el-form>
    </el-dialog>
  </div>
</template>
