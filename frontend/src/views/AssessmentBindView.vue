<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';
import LoadingState from '../components/LoadingState.vue';

// AssessmentBinding (assessment-binding.tsx): bind submitted report → talent profile.
type Invite = { id: string; name: string; title: string; submitted_at: string | null; participant_kind: string };
type Talent = { id: string; name: string };
const invites = ref<Invite[] | null>(null);
const talents = ref<Talent[]>([]);
const selectedInvite = ref('');
const selectedTalent = ref('');
const binding = ref(false);
const error = ref('');
const message = ref('');

async function load() {
  error.value = '';
  try {
    invites.value = (await api<{ items: Invite[] }>('/assessment/invites?view=reports')).items;
    talents.value = (await api<{ items: Talent[] }>('/talents?page_size=100')).items;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function bind() {
  binding.value = true;
  error.value = '';
  try {
    await api(`/assessment/invites/${selectedInvite.value}/bind`, { candidate_id: selectedTalent.value, confirm: 'bind_assessment' });
    message.value = '测评已关联人才档案。';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    binding.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <div><h2>测评绑定人才档案</h2><p>把已完成的测评报告关联到对应人才；关联动作写入审计。</p></div>
    </div>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <Notice v-if="message" kind="success">{{ message }}</Notice>
    <LoadingState v-if="!invites && !error" text="正在读取测评与人才…" />
    <form v-else class="form-grid" @submit.prevent="bind">
      <label class="field"><span>选择已提交的测评 *</span>
        <select v-model="selectedInvite" required>
          <option value="">请选择</option>
          <option v-for="i in invites" :key="i.id" :value="i.id">{{ i.name }} · {{ i.title }}（{{ i.submitted_at ? '已提交' : '未提交' }}）</option>
        </select>
      </label>
      <label class="field"><span>选择人才档案 *</span>
        <select v-model="selectedTalent" required>
          <option value="">请选择</option>
          <option v-for="t in talents" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </label>
      <div class="form-footer">
        <p>仅已提交的测评可绑定；一次绑定一个档案。</p>
        <button class="primary" :disabled="binding || !selectedInvite || !selectedTalent">{{ binding ? '绑定中…' : '确认绑定' }}</button>
      </div>
    </form>
  </section>
</template>
