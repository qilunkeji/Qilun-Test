<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';

// 建立本次面试 (interviews.tsx): application + optional assessment + rubric.
const route = useRoute();
const router = useRouter();
const error = ref('');
const busy = ref(false);
type Assessment = { id: string; title: string; submitted_at: string };
const assessments = ref<Assessment[]>([]);
const form = ref({
  application_id: (route.params.applicationId as string) || '',
  assessment_id: null as string | null,
  question_count: 10 as 10 | 20,
  rubric: [{ name: '', requirement: '', weight: 50 }],
});

onMounted(async () => {
  if (form.value.application_id) {
    try {
      assessments.value = (await api<{ items: Assessment[] }>(`/interviews/assessments/${form.value.application_id}`)).items;
    } catch { /* optional data */ }
  }
});

function addCriterion() { if (form.value.rubric.length < 6) form.value.rubric.push({ name: '', requirement: '', weight: 10 }); }
function removeCriterion(i: number) { if (form.value.rubric.length > 1) form.value.rubric.splice(i, 1); }

async function create() {
  busy.value = true;
  error.value = '';
  try {
    await api('/interviews', form.value);
    router.push('/interviews');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <h2>建立本次面试</h2>
      <button :disabled="busy" @click="router.push('/interviews')">取消并返回</button>
    </div>
    <Notice>面试问题由模型依据岗位证据标准与候选人材料生成；人工确认后才进入面试。</Notice>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <form class="form-grid" @submit.prevent="create">
      <label class="field"><span>岗位申请 ID *</span><input v-model="form.application_id" required placeholder="从人才档案的申请记录发起" /></label>
      <label class="field"><span>关联测评（可选）</span>
        <select v-model="form.assessment_id">
          <option :value="null">不关联</option>
          <option v-for="a in assessments" :key="a.id" :value="a.id">{{ a.title }}（{{ a.submitted_at }}）</option>
        </select>
      </label>
      <label class="field"><span>问题数量 *</span>
        <select v-model.number="form.question_count">
          <option :value="10">10 题</option>
          <option :value="20">20 题</option>
        </select>
      </label>
      <div class="wide">
        <h3>评价标准</h3>
        <p class="muted">每项 1–100 权重；最多 6 项。</p>
      </div>
      <fieldset v-for="(item, i) in form.rubric" :key="i" class="form-grid wide" style="border:0;padding:0;margin:0">
        <label class="field"><span>能力项 *</span><input v-model="item.name" :required="true" /></label>
        <label class="field"><span>要求 *</span><input v-model="item.requirement" required /></label>
        <label class="field"><span>权重 *</span><input v-model.number="item.weight" type="number" min="1" max="100" required /></label>
        <div class="field"><span>&nbsp;</span><button type="button" :disabled="form.rubric.length === 1" @click="removeCriterion(i)">删除此项</button></div>
      </fieldset>
      <div class="wide"><button type="button" :disabled="form.rubric.length >= 6" @click="addCriterion">＋ 添加能力项</button></div>
      <div class="form-footer sticky-actions">
        <p>建立后先生成问题清单；回传转写文本后再运行综合评估。</p>
        <div class="actions">
          <button type="button" :disabled="busy" @click="router.push('/interviews')">取消</button>
          <button class="primary" :disabled="busy || !form.application_id">{{ busy ? '创建中…' : '创建面试评估' }}</button>
        </div>
      </div>
    </form>
  </section>
</template>
