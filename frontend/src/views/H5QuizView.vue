<script setup lang="ts">
// 277-question quiz shell — uses the ported DraftAutosaver verbatim
// (250ms debounce, sequence/ack, revision-aware sends).
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { DraftAutosaver } from '../logic/draft-autosaver';

type Question = { id: string; order: number; module: string; answer_type: number; title: string; a: string; b: string };
type ValueDraft = { selected: string[][]; ranked: string[] };
type OpenData = { id: string; revision: number; submitted: boolean; answers: Record<string, number>; value_draft: ValueDraft; package: { questions: Question[]; choices: { paired: string[]; single: string[] }; value_groups: string[][] } };

const router = useRouter();
const token = ref('');
const data = ref<OpenData | null>(null);
const answers = ref<Record<string, number>>({});
const currentIndex = ref(0);
const status = ref('');
let autosaver: DraftAutosaver<Record<string, number>> | null = null;

const PAGE_SIZE = 3;
const questions = computed<Question[]>(() => data.value?.package.questions ?? []);
const pageCount = computed(() => Math.ceil(questions.value.length / PAGE_SIZE));
const pageQuestions = computed(() => questions.value.slice(currentIndex.value * PAGE_SIZE, currentIndex.value * PAGE_SIZE + PAGE_SIZE));
const answeredCount = computed(() => Object.keys(answers.value).length);

function choiceLabel(q: Question, choice: number) {
  const choices = q.answer_type === 5 ? data.value!.package.choices.paired : data.value!.package.choices.single;
  return choices[choice - 1] ?? String(choice);
}

function touch() {
  autosaver?.update({ ...answers.value });
}

async function submitAll() {
  await autosaver?.flush();
  const res = await fetch('/api/v1/public/assessment/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token: token.value, revision: autosaver?.revision ?? data.value?.revision ?? 0, answers: answers.value, value_draft: data.value?.value_draft ?? { selected: [[], [], [], []], ranked: [] } }),
  });
  const payload = await res.json();
  if (!res.ok) { status.value = payload.error?.message ?? '提交失败'; return; }
  localStorage.setItem(`qilun-report:${token.value}`, JSON.stringify(payload.data.report));
  router.push({ name: 'h5-report', hash: '#' + token.value });
}

onMounted(async () => {
  token.value = location.hash.slice(1) || localStorage.getItem('qilun-last-token') || '';
  if (!token.value) { router.push({ name: 'h5-entry' }); return; }
  localStorage.setItem('qilun-last-token', token.value);
  const res = await fetch('/api/v1/public/assessment/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ token: token.value }) });
  const payload = await res.json();
  if (!res.ok) { status.value = payload.error?.message ?? '测评不可访问'; return; }
  data.value = payload.data;
  answers.value = payload.data.answers ?? {};
  if (payload.data.submitted) { router.push({ name: 'h5-report', hash: '#' + token.value }); return; }
  autosaver = new DraftAutosaver<Record<string, number>>(
    payload.data.revision,
    { ...answers.value },
    async (value, revision) => {
      const r = await fetch('/api/v1/public/assessment/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ token: token.value, revision, answers: value, value_draft: payload.data.value_draft }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error?.code ?? 'SAVE_FAILED');
      return { revision: body.data.revision };
    },
    state => { status.value = state; },
  );
});
</script>

<template>
  <div style="max-width: 640px; margin: 0 auto; padding: 16px" v-if="data">
    <el-progress :percentage="Math.min(100, Math.round(answeredCount / questions.length * 100))" style="margin-bottom: 8px" />
    <div style="color: #909399; font-size: 12px; margin-bottom: 16px">已答 {{ answeredCount }}/{{ questions.length }} · 自动保存：{{ status || '空闲' }}</div>
    <el-alert v-if="status.startsWith('提交失败') || status === '测评不可访问'" :title="status" type="error" show-icon style="margin-bottom: 12px" />
    <el-card v-for="q in pageQuestions" :key="q.id" style="margin-bottom: 12px">
      <div style="margin-bottom: 12px; font-weight: 600">{{ q.order }}. {{ q.title }}</div>
      <el-radio-group :model-value="answers[q.id]" @update:model-value="(v: number) => { answers[q.id] = v; touch(); }">
        <el-radio-button v-for="c in 5" :key="c" :value="c" style="margin: 4px">{{ choiceLabel(q, c) }}</el-radio-button>
      </el-radio-group>
    </el-card>
    <div style="display: flex; justify-content: space-between">
      <el-button :disabled="currentIndex === 0" @click="currentIndex--">上一页</el-button>
      <el-button v-if="currentIndex < pageCount - 1" type="primary" @click="currentIndex++">下一页</el-button>
      <el-button v-else type="success" @click="submitAll">提交</el-button>
    </div>
  </div>
</template>
