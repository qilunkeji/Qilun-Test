<script setup lang="ts">
// 277-question quiz + value selection (4组×8选5 → 20排10), then submit.
// DraftAutosaver ported verbatim (250ms debounce, sequence/ack).
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
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
const submitError = ref('');
// Timing: count only when page visible + interaction within 120s window
let activeSeconds = 0;
let lastInteraction = Date.now();
let timingInterval: ReturnType<typeof setInterval> | undefined;
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
const progress = computed(() => Math.min(100, Math.round(answeredCount.value / (questions.value.length || 1) * 100)));

function choiceLabel(q: Question, choice: number) {
  const choices = q.answer_type === 5 ? data.value!.package.choices.paired : data.value!.package.choices.single;
  return choices[choice - 1] ?? String(choice);
}

function touch() {
  lastInteraction = Date.now();
  autosaver?.update({ ...answers.value });
}

function answer(q: Question, choice: number) {
  answers.value[q.id] = choice;
  touch();
}

function toggleWord(groupIndex: number, id: string) {
  const group = selected.value[groupIndex];
  const at = group.indexOf(id);
  if (at >= 0) group.splice(at, 1);
  else if (group.length < 5) group.push(id);
  touch();
}

function wordLabel(id: string) { return wordsById.value[id]?.title ?? id; }
function wordDescription(id: string) { return wordsById.value[id]?.description ?? ''; }

function toggleRank(id: string) {
  const i = ranked.value.indexOf(id);
  if (i >= 0) ranked.value.splice(i, 1);
  else if (ranked.value.length < 10) ranked.value.push(id);
  touch();
}

function moveRank(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= ranked.value.length) return;
  const list = ranked.value;
  [list[index], list[target]] = [list[target], list[index]];
  touch();
}

async function submitAll() {
  if (!groupsComplete.value || !rankingComplete.value) return;
  submitError.value = '';
  await autosaver?.flush();
  const res = await fetch('/api/v1/public/assessment/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token: token.value, revision: autosaver?.revision ?? data.value?.revision ?? 0, active_seconds: activeSeconds, answers: answers.value, value_draft: { selected: selected.value, ranked: ranked.value } }),
  });
  const payload = await res.json();
  if (!res.ok) { submitError.value = payload.error?.message ?? '提交失败'; return; }
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
    selected.value = draft.selected.map((g: string[]) => [...g]);
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
  // Start timing: 1s interval, visible + interaction within 120s
  const trackInteraction = () => { lastInteraction = Date.now(); };
  document.addEventListener('click', trackInteraction);
  document.addEventListener('keydown', trackInteraction);
  timingInterval = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInteraction < 120000) {
      activeSeconds++;
    }
  }, 1000);
});

onUnmounted(() => {
  if (timingInterval) clearInterval(timingInterval);
});
</script>

<template>
  <main v-if="data" class="h5-shell h5-reference h5-assessment">
    <div class="h5-brand">
      <img src="/brand/qilun-logo-light.png" alt="齐论AI" />
      <span>内部性格与发展测评</span>
    </div>
    <p class="h5-save-status" :class="{ failed: status.includes('失败') }">已答 {{ answeredCount }}/{{ questions.length }} · 自动保存：{{ status || '空闲' }}</p>
    <progress :value="progress" max="100" aria-label="答题进度" />

    <template v-if="phase === 'quiz'">
      <section v-for="q in pageQuestions" :key="q.id" class="h5-card">
        <fieldset class="h5-compact-question">
          <legend>{{ q.order }}. {{ q.title }}</legend>
          <div class="h5-dot-options">
            <label v-for="c in 5" :key="c" :class="{ selected: answers[q.id] === c }">
              <input type="radio" :name="q.id" :value="c" :checked="answers[q.id] === c" @change="answer(q, c)" />
              <span class="h5-choice-dot">{{ c }}</span>
              <small>{{ choiceLabel(q, c) }}</small>
            </label>
          </div>
        </fieldset>
      </section>
      <div class="h5-page-control">
        <button :disabled="currentIndex === 0" @click="currentIndex--">上一组</button>
        <label>第
          <select aria-label="答题组页码" v-model.number="currentIndex">
            <option v-for="i in pageCount" :key="i" :value="i - 1">{{ i }}</option>
          </select>组
        </label>
        <button v-if="currentIndex < pageCount - 1" @click="currentIndex++">下一组</button>
        <button v-else class="primary" :disabled="!allAnswered" @click="phase = 'values'">
          {{ allAnswered ? '进入价值观选择' : `还需回答 ${questions.length - answeredCount} 题` }}
        </button>
      </div>
    </template>

    <template v-else-if="phase === 'values'">
      <section class="h5-card">
        <h1>第二部分：价值观词组选择</h1>
        <p>每组选择最符合你的 5 个词；已选 {{ selectedFlat.length }}/20。</p>
        <div v-for="(group, gi) in data.package.value_groups" :key="gi" class="h5-participation">
          <summary style="list-style:none"><b>第 {{ gi + 1 }} 组</b>（已选 {{ selected[gi].length }}/5）</summary>
          <div class="h5-word-grid">
            <button v-for="id in group" :key="id" type="button" :aria-pressed="selected[gi].includes(id)" @click="toggleWord(gi, id)">
              {{ wordLabel(id) }}<small>{{ wordDescription(id) }}</small>
            </button>
          </div>
        </div>
        <div class="h5-page-control">
          <button @click="phase = 'quiz'">返回答题</button>
          <button class="primary" :disabled="!groupsComplete" @click="phase = 'rank'">
            {{ groupsComplete ? '进入排序' : '请完成四组选择（每组 5 个）' }}
          </button>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="h5-card">
        <h1>第三部分：选出最重要的 10 项并排序</h1>
        <p>已排 {{ ranked.length }}/10。</p>
        <ul class="h5-value-ranking">
          <li v-for="(id, i) in ranked" :key="id">
            <span>第 {{ i + 1 }} 名 · {{ wordLabel(id) }}</span>
            <div>
              <button type="button" :disabled="i === 0" @click="moveRank(i, -1)">上移</button>
              <button type="button" :disabled="i === ranked.length - 1" @click="moveRank(i, 1)">下移</button>
              <button type="button" @click="toggleRank(id)">移除</button>
            </div>
          </li>
        </ul>
        <details class="h5-participation">
          <summary>从已选 20 词中继续挑选</summary>
          <div class="h5-word-grid">
            <button v-for="id in selectedFlat.filter(x => !ranked.includes(x))" :key="id" type="button" :disabled="ranked.length >= 10" @click="toggleRank(id)">
              {{ wordLabel(id) }}<small>点击加入第 {{ ranked.length + 1 }} 名</small>
            </button>
          </div>
        </details>
        <div v-if="submitError" class="h5-submit-confirm"><p role="alert">{{ submitError }}</p></div>
        <div class="h5-submit-confirm">
          <p>提交后生成个人参考报告；答案不再修改。</p>
          <button class="primary" :disabled="!rankingComplete" @click="submitAll">
            {{ rankingComplete ? '提交测评' : `还需选出 ${10 - ranked.length} 项` }}
          </button>
        </div>
        <div class="h5-page-control">
          <button @click="phase = 'values'">返回选择</button>
        </div>
      </section>
    </template>
  </main>
  <main v-else class="h5-shell h5-reference">
    <div class="h5-brand"><img src="/brand/qilun-logo-light.png" alt="齐论AI" /><span>性格与发展测评</span></div>
    <section class="h5-card"><p role="alert">{{ status || '正在打开测评…' }}</p></section>
  </main>
</template>
