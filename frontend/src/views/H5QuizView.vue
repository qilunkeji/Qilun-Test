<script setup lang="ts">
// 277-question quiz + value selection (4组×8选5 → 20排10), then submit.
// DraftAutosaver ported verbatim (250ms debounce, sequence/ack).
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { DraftAutosaver } from '../logic/draft-autosaver';

type Question = { id: string; order: number; module: string; answer_type: number; title: string; a: string; b: string };
type Word = { id: string; title: string; description: string };
type ValueDraft = { selected: string[][]; ranked: string[] };
type OpenData = { id: string; revision: number; submitted: boolean; answers: Record<string, number>; value_draft: ValueDraft; package: { questions: Question[]; choices: { paired: string[]; single: string[] }; value_groups: string[][]; words: Word[]; title: string } };

const router = useRouter();
const token = ref('');
const data = ref<OpenData | null>(null);
const answers = ref<Record<string, number>>({});
const currentIndex = ref(0);
const status = ref('');
const phase = ref<'quiz' | 'values' | 'rank'>('quiz');
const selected = ref<string[][]>([[], [], [], []]);
const ranked = ref<string[]>([]);
let autosaver: DraftAutosaver<Record<string, number>> | null = null;

const PAGE_SIZE = 3;
const questions = computed<Question[]>(() => data.value?.package.questions ?? []);
const pageCount = computed(() => Math.ceil(questions.value.length / PAGE_SIZE));
const pageQuestions = computed(() => questions.value.slice(currentIndex.value * PAGE_SIZE, currentIndex.value * PAGE_SIZE + PAGE_SIZE));
const answeredCount = computed(() => Object.keys(answers.value).length);
const allAnswered = computed(() => questions.value.length > 0 && answeredCount.value === questions.value.length);
const wordsById = computed<Record<string, Word>>(() => Object.fromEntries((data.value?.package.words ?? []).map(w => [w.id, w])));
const selectedFlat = computed(() => selected.value.flat());
const groupsComplete = computed(() => selected.value.every(g => g.length === 5));
const rankingComplete = computed(() => ranked.value.length === 10);

function choiceLabel(q: Question, choice: number) {
  const choices = q.answer_type === 5 ? data.value!.package.choices.paired : data.value!.package.choices.single;
  return choices[choice - 1] ?? String(choice);
}

function touch() {
  autosaver?.update({ ...answers.value });
}

function toggleWord(groupIndex: number, id: string) {
  const group = selected.value[groupIndex];
  const at = group.indexOf(id);
  if (at >= 0) group.splice(at, 1);
  else if (group.length < 5) group.push(id);
}

function wordLabel(id: string) { return wordsById.value[id]?.title ?? id; }

function moveRank(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= ranked.value.length) return;
  const list = ranked.value;
  [list[index], list[target]] = [list[target], list[index]];
}

async function submitAll() {
  if (!groupsComplete.value || !rankingComplete.value) return;
  await autosaver?.flush();
  const res = await fetch('/api/v1/public/assessment/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token: token.value, revision: autosaver?.revision ?? data.value?.revision ?? 0, answers: answers.value, value_draft: { selected: selected.value, ranked: ranked.value } }),
  });
  const payload = await res.json();
  if (!res.ok) { ElMessage.error(payload.error?.message ?? '提交失败'); return; }
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
  const draft = payload.data.value_draft;
  if (draft && Array.isArray(draft.selected) && draft.selected.every((g: string[]) => Array.isArray(g))) {
    selected.value = draft.selected.map(g => [...g]);
    ranked.value = [...(draft.ranked ?? [])];
  }
  autosaver = new DraftAutosaver<Record<string, number>>(
    payload.data.revision,
    { ...answers.value },
    async (value, revision) => {
      const r = await fetch('/api/v1/public/assessment/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ token: token.value, revision, answers: value, value_draft: { selected: selected.value, ranked: ranked.value } }) });
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
    <template v-if="phase === 'quiz'">
      <el-progress :percentage="Math.min(100, Math.round(answeredCount / questions.length * 100))" style="margin-bottom: 8px" />
      <div style="color: #909399; font-size: 12px; margin-bottom: 16px">已答 {{ answeredCount }}/{{ questions.length }} · 自动保存：{{ status || '空闲' }}</div>
      <el-card v-for="q in pageQuestions" :key="q.id" style="margin-bottom: 12px">
        <div style="margin-bottom: 12px; font-weight: 600">{{ q.order }}. {{ q.title }}</div>
        <el-radio-group :model-value="answers[q.id]" @update:model-value="(v: number) => { answers[q.id] = v; touch(); }">
          <el-radio-button v-for="c in 5" :key="c" :value="c" style="margin: 4px">{{ choiceLabel(q, c) }}</el-radio-button>
        </el-radio-group>
      </el-card>
      <div style="display: flex; justify-content: space-between">
        <el-button :disabled="currentIndex === 0" @click="currentIndex--">上一页</el-button>
        <el-button v-if="currentIndex < pageCount - 1" type="primary" @click="currentIndex++">下一页</el-button>
        <el-button v-else :disabled="!allAnswered" type="primary" @click="phase = 'values'">
          {{ allAnswered ? '进入价值观选择' : `还需回答 ${questions.length - answeredCount} 题` }}
        </el-button>
      </div>
    </template>

    <template v-else-if="phase === 'values'">
      <h4>第二部分：价值观词组选择（每组选 5 个）</h4>
      <div style="color: #909399; font-size: 12px; margin-bottom: 12px">已选 {{ selectedFlat.length }}/20 · 每组须恰好 5 个</div>
      <el-card v-for="(group, gi) in data.package.value_groups" :key="gi" style="margin-bottom: 12px">
        <div style="margin-bottom: 8px; font-weight: 600">第 {{ gi + 1 }} 组（已选 {{ selected[gi].length }}/5）</div>
        <el-checkbox-group :model-value="selected[gi]" @update:model-value="(vals: string[]) => { if (vals.length <= 5) selected[gi] = vals; }">
          <el-checkbox v-for="id in group" :key="id" :value="id" :disabled="selected[gi].length >= 5 && !selected[gi].includes(id)">{{ wordLabel(id) }}</el-checkbox>
        </el-checkbox-group>
      </el-card>
      <div style="display: flex; justify-content: space-between">
        <el-button @click="phase = 'quiz'">返回答题</el-button>
        <el-button :disabled="!groupsComplete" type="primary" @click="phase = 'rank'">
          {{ groupsComplete ? '进入排序' : '请完成四组选择' }}
        </el-button>
      </div>
    </template>

    <template v-else>
      <h4>第三部分：选出最重要的 10 项并排序</h4>
      <div style="color: #909399; font-size: 12px; margin-bottom: 12px">已排 {{ ranked.length }}/10</div>
      <el-card style="margin-bottom: 12px">
        <div v-for="id in selectedFlat" :key="id" style="display: flex; align-items: center; gap: 8px; padding: 4px 0">
          <el-checkbox :model-value="ranked.includes(id)" :disabled="!ranked.includes(id) && ranked.length >= 10" @update:model-value="(v: boolean) => { if (v) ranked.push(id); else ranked = ranked.filter(x => x !== id); }">{{ wordLabel(id) }}</el-checkbox>
          <template v-if="ranked.includes(id)">
            <el-tag size="small">第 {{ ranked.indexOf(id) + 1 }}</el-tag>
            <el-button size="small" text @click="moveRank(ranked.indexOf(id), -1)">上移</el-button>
            <el-button size="small" text @click="moveRank(ranked.indexOf(id), 1)">下移</el-button>
          </template>
        </div>
      </el-card>
      <div style="display: flex; justify-content: space-between">
        <el-button @click="phase = 'values'">返回选择</el-button>
        <el-button :disabled="!rankingComplete" type="success" @click="submitAll">
          {{ rankingComplete ? '提交测评' : `还需选出 ${10 - ranked.length} 项` }}
        </el-button>
      </div>
    </template>
  </div>
</template>
