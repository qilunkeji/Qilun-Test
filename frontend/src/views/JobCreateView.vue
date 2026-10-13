<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, statusLabels, type JobDetail } from '../logic/api';
import Notice from '../components/Notice.vue';

// Legacy JobForm (jobs.tsx): form-grid with sections; create → POST /jobs, edit → POST /jobs/:id/versions.
const route = useRoute();
const router = useRouter();
const editingId = computed(() => (route.path.startsWith('/jobs/') && route.params.id ? String(route.params.id) : ''));
const detail = ref<JobDetail | null>(null);
const error = ref('');
const busy = ref(false);
const jobStatuses = ['draft', 'pending', 'open', 'paused', 'closed', 'archived'] as const;

const form = ref({
  title: '', department: '', owner: '', location: '',
  tasks: '', criteria: '', public_jd: '',
  status: 'draft', change_reason: '',
});

onMounted(async () => {
  if (!editingId.value) { form.value.change_reason = '首次创建'; return; }
  try {
    detail.value = await api<JobDetail>(`/jobs/${editingId.value}`);
    const current = detail.value.versions[0];
    if (current) {
      form.value = {
        title: current.title, department: current.department, owner: current.owner, location: current.location,
        tasks: current.tasks, criteria: current.criteria, public_jd: current.public_jd,
        status: current.status, change_reason: '',
      };
    }
  } catch {
    error.value = '岗位暂不可访问，请确认账号权限或稍后重试。';
  }
});

const isEdit = computed(() => !!detail.value);

async function save() {
  if (busy.value) return;
  if (form.value.status === 'open' && !window.confirm('确认已审核本次岗位任务、证据标准与对外描述，并将此版本标记为招聘中？只保存本站岗位版本，不向外部渠道发布。')) return;
  busy.value = true;
  error.value = '';
  try {
    if (detail.value) {
      await api(`/jobs/${detail.value.id}/versions`, { ...form.value, expected_revision: detail.value.revision });
      router.push(`/jobs/${detail.value.id}`);
    } else {
      const result = await api<{ id: string }>('/jobs', form.value);
      router.push(`/jobs/${result.id}`);
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

function cancel() {
  if (busy.value) return;
  router.push(detail.value ? `/jobs/${detail.value.id}` : '/jobs');
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <h2>{{ isEdit ? `岗位改版 · V${(detail?.revision ?? 0) + 1}` : '新建招聘岗位' }}</h2>
      <button :disabled="busy" @click="cancel">取消并返回</button>
    </div>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <form class="form-grid recruit-fields" @submit.prevent="save">
      <nav class="form-sections wide" aria-label="岗位表单分区"><a href="#job-basics">基本信息</a><a href="#job-evidence">任务与证据</a><a href="#job-publication">版本与状态</a></nav>
      <h3 class="wide" id="job-basics">基本信息</h3>
      <p class="wide muted">带 * 为必填。部门、负责人和工作方式沿用现有自由文本，未建立额外强制字典。</p>
      <label class="field"><span>岗位名称 *</span><input v-model="form.title" name="title" required /></label>
      <label class="field"><span>所属部门 *</span><input v-model="form.department" name="department" required /></label>
      <label class="field"><span>负责人 *</span><input v-model="form.owner" name="owner" required /></label>
      <label class="field"><span>地点 / 工作方式 *</span><input v-model="form.location" name="location" required /></label>
      <h3 class="wide" id="job-evidence">任务与证据</h3>
      <label class="field wide"><span>核心任务与交付物 *</span><textarea v-model="form.tasks" name="tasks" rows="5" required /></label>
      <label class="field wide"><span>岗位相关证据标准与核验方式 *</span><textarea v-model="form.criteria" name="criteria" rows="5" required /><small>示例：作品、项目记录、实际任务和面试举例；明确本人职责及核验方式。不设置人格类型筛选条件。</small></label>
      <label class="field wide"><span>对外岗位描述（人工确认稿）</span><textarea v-model="form.public_jd" name="public_jd" rows="5" /></label>
      <h3 class="wide" id="job-publication">版本与状态</h3>
      <label class="field"><span>状态 *</span>
        <select v-model="form.status" name="status">
          <option v-for="key in jobStatuses" :key="key" :value="key">{{ statusLabels[key] }}</option>
        </select>
      </label>
      <label class="field"><span>{{ isEdit ? '本次改版理由 *' : '创建说明 *' }}</span><input v-model="form.change_reason" name="change_reason" required /></label>
      <div class="form-footer sticky-actions">
        <p>{{ isEdit ? '保存后新增版本，不覆盖历史版本。' : '保存为首个岗位版本。' }} 草稿仍需填写现有必填字段；「招聘中」需再次确认，本站保存不等于外部发布。</p>
        <div class="actions">
          <button type="button" :disabled="busy" @click="cancel">取消</button>
          <button class="primary" :disabled="busy">{{ busy ? '保存中…' : isEdit ? '确认保存新版本' : '创建岗位版本' }}</button>
        </div>
      </div>
    </form>
  </section>
</template>
