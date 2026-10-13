<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, date } from '../logic/api';
import Notice from '../components/Notice.vue';
import EmptyBox from '../components/EmptyBox.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Resume screens (resume-library.tsx 岗位筛选): batches + workbench panel.
type Batch = { id: string; created_at: string; title: string; count: number };
type ScreenItem = { id: string; status: string; error_code: string | null; version: number; name: string; result: unknown; review: string | null; review_note: string | null; revision: number };
type BatchDetail = { id: string; title: string; requirements: string; created_at: string; round: number; items: ScreenItem[]; review_history: { item_id: string; review: string; note: string; round: number; created_at: string }[] };
type JobRow = { id: string; version_id: string; title: string };

const batches = ref<Batch[] | null>(null);
const jobs = ref<JobRow[]>([]);
const selected = ref<BatchDetail | null>(null);
const showCreate = ref(false);
const creating = ref(false);
const error = ref('');
const message = ref('');
const form = ref({ job_version_id: '', requirements: '', resume_ids: [] as string[] });
type ResumeRow = { id: string; name: string };
const resumes = ref<ResumeRow[]>([]);

async function loadBatches() {
  error.value = '';
  try {
    batches.value = (await api<{ items: Batch[] }>('/resume-screens')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function loadJobs() {
  try { jobs.value = (await api<{ items: JobRow[] }>('/jobs')).items; } catch { /* optional */ }
}
async function loadResumes() {
  try { resumes.value = (await api<{ items: ResumeRow[] }>('/resume-library?page_size=100')).items; } catch { /* optional */ }
}
async function openDetail(id: string) {
  error.value = '';
  try {
    selected.value = await api<BatchDetail>(`/resume-screens/${id}`);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
function toggleResume(id: string) {
  const list = form.value.resume_ids;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else if (list.length < 20) list.push(id);
}
async function createBatch() {
  creating.value = true;
  error.value = '';
  try {
    await api('/resume-screens', { ...form.value, authorized_to_send: true });
    message.value = '筛选批次已创建，等待 AI 处理。';
    showCreate.value = false;
    await loadBatches();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creating.value = false;
  }
}
onMounted(() => { loadBatches(); loadJobs(); loadResumes(); });
</script>

<template>
  <div class="page-heading">
    <div>
      <h1>岗位筛选</h1>
      <p>每轮分析独立留档；智能体建议不替代人工判断。</p>
    </div>
    <button class="primary" @click="showCreate = !showCreate">{{ showCreate ? '收起创建' : '发起新一轮岗位分析' }}</button>
  </div>

  <Notice v-if="error" kind="error">{{ error }}</Notice>
  <Notice v-if="message" kind="success">{{ message }}</Notice>

  <section v-if="showCreate" class="panel">
    <h2>发起新一轮岗位分析</h2>
    <form class="form-grid" @submit.prevent="createBatch">
      <label class="field"><span>岗位与固定版本 *</span>
        <select v-model="form.job_version_id" required>
          <option value="">请选择岗位</option>
          <option v-for="j in jobs" :key="j.version_id" :value="j.version_id">{{ j.title }}</option>
        </select>
      </label>
      <label class="field wide"><span>招聘要求：职责、必要条件、可放宽项 *</span>
        <textarea v-model="form.requirements" rows="4" required minlength="5" maxlength="5000" placeholder="描述岗位实际需要解决的问题，不填写性别、婚育等筛选条件" />
      </label>
      <div class="wide">
        <h3>选择简历（最多 20 份，已选 {{ form.resume_ids.length }}）</h3>
        <div class="table-scroll" style="max-height:260px">
          <table>
            <tbody>
              <tr v-for="r in resumes" :key="r.id">
                <td><label class="check-label"><input type="checkbox" :checked="form.resume_ids.includes(r.id)" @change="toggleResume(r.id)" /> {{ r.name }}</label></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="form-footer">
        <p>智能体建议不替代人工判断。</p>
        <button class="primary" :disabled="creating || !form.job_version_id || !form.requirements || !form.resume_ids.length">{{ creating ? '提交中…' : '提交分析' }}</button>
      </div>
    </form>
  </section>

  <section class="panel">
    <div class="section-heading">
      <div><h2>历史批次</h2><p>每轮审阅独立留档，可回看人工记录。</p></div>
    </div>
    <RetryBox v-if="error" :text="error" @retry="loadBatches" />
    <LoadingState v-else-if="!batches" text="正在读取批次…" />
    <EmptyBox v-else-if="!batches.length">发起第一轮岗位分析后，这里记录每轮审阅。</EmptyBox>
    <div v-else class="table-scroll">
      <table>
        <thead><tr><th>创建时间</th><th>岗位</th><th>简历数</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="b in batches" :key="b.id">
            <td>{{ date(b.created_at) }}</td>
            <td><strong>{{ b.title }}</strong></td>
            <td>{{ b.count }}</td>
            <td><button class="text-button" @click="openDetail(b.id)">查看本轮 →</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>

  <section v-if="selected" class="panel">
    <div class="toolbar">
      <h2>{{ selected.title }} · 本轮审阅</h2>
      <span>第{{ selected.round }}轮</span>
      <button @click="selected = null">收起</button>
    </div>
    <p>{{ selected.requirements }}</p>
    <div class="table-scroll">
      <table>
        <thead><tr><th>人才</th><th>AI 状态</th><th>人工审核</th><th>审核记录</th></tr></thead>
        <tbody>
          <tr v-for="i in selected.items" :key="i.id">
            <td><strong>{{ i.name }}</strong></td>
            <td>{{ i.status }}{{ i.error_code ? ` · ${i.error_code}` : '' }}</td>
            <td>{{ i.review ?? '待审' }}</td>
            <td><span class="muted">{{ i.review_note ?? '—' }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <details v-if="selected.review_history.length">
      <summary>历轮人工记录</summary>
      <p v-for="(h, i) in selected.review_history" :key="i">第{{ h.round }}轮 · {{ date(h.created_at) }} · {{ h.review }}<br />{{ h.note }}</p>
    </details>
  </section>
</template>
