<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';
import LoadingState from '../components/LoadingState.vue';

// 277-题复刻面板 (assessment-replica.tsx): answer + server-side replay.
type Ability = { item: string; name: string; value: number };
type ReplayResult = { abilities: Ability[]; ability_summary: { top_six: Ability[]; bottom_three: Ability[] }; rows: { item: number; name: string; type: number; score: number }[]; roles: { name: string; scoreTotal: number }[] };
type Question = { id: string; title: string; answer_type: number };
const loading = ref(false);
const error = ref('');
const result = ref<ReplayResult | null>(null);
const questions = ref<Question[]>([]);
const answers = ref<Record<string, number>>({});
declare global { interface Window { _replicaToken?: string; _replicaGroups?: string[][] } }

async function loadPackage() {
  try {
    const me = await (await fetch('/api/v1/auth/me')).json();
    const csrf = me.data.csrf_token;
    const invite = await (await fetch('/api/v1/assessment/invites', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ purpose: '复刻面板', days: 1 }),
    })).json();
    if (!invite.data?.url) { error.value = '无法获取题目'; return; }
    const token = invite.data.url.split('#')[1];
    const open = await (await fetch('/api/v1/public/assessment/entry/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ token }),
    })).json();
    const enroll = await (await fetch('/api/v1/public/assessment/entry/enroll', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ token, participant_key: 'ReplicaPanel' + '0123456789012345678901234', accepted: true, consent_version: open.data.consent_version, profile: { name: '复刻', phone: '13800000000', birth_date: '1990-01-01' } }),
    })).json();
    const personal = await (await fetch('/api/v1/public/assessment/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ token: enroll.data.token }),
    })).json();
    questions.value = personal.data.package.questions;
    window._replicaToken = enroll.data.token;
    window._replicaGroups = personal.data.package.value_groups;
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function replay() {
  loading.value = true;
  error.value = '';
  try {
    const groups = window._replicaGroups as string[][];
    const selected = groups.map((g: string[]) => g.slice(0, 5));
    const ranked = selected.flat().slice(0, 10);
    const values = ranked.map((id: string, i: number) => ({ id, rank: i + 1 }));
    result.value = await api<ReplayResult>('/assessment/gh-replay/score', {
      version: 'gh-report-replay-v22', purpose: 'evidence_verification_only', input_kind: 'manual_answers',
      answers: answers.value, values,
      value_flow: { layout: 'captured_32_words_v3', selected_by_group: selected, ranked },
    });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(loadPackage);
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <div><h2>齐论测评 · 规则核验</h2><p>逐题作答后运行计算，服务端按已知公式复算全部指标；本页仅用于规则核验。</p></div>
    </div>
    <Notice>输入为手工核验样例，不写入人才档案；结果仅证明当前实现与已知规则一致。</Notice>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <LoadingState v-if="!questions.length && !error" text="正在读取题包…" />
    <template v-else>
      <div class="document" style="max-height:420px">
        <div v-for="q in questions.slice(0, 50)" :key="q.id" style="display:flex;align-items:center;gap:10px;padding:3px 16px">
          <span style="width:38px;text-align:right;color:#5f5b5b;font-size:12px">{{ q.id }}</span>
          <div class="actions">
            <button v-for="c in 5" :key="c" type="button" :aria-pressed="answers[q.id] === c"
              :style="answers[q.id] === c ? 'border-color:#9b0000;color:#9b0000' : ''"
              @click="answers[q.id] = c" :title="`${c}`" style="padding:4px 10px;font-size:12px">{{ c }}</button>
          </div>
        </div>
        <details style="padding:8px 16px">
          <summary>显示剩余 {{ questions.length - 50 }} 题</summary>
          <div v-for="q in questions.slice(50)" :key="q.id" style="display:flex;align-items:center;gap:10px;padding:3px 0">
            <span style="width:38px;text-align:right;color:#5f5b5b;font-size:12px">{{ q.id }}</span>
            <div class="actions">
              <button v-for="c in 5" :key="c" type="button" :aria-pressed="answers[q.id] === c"
                :style="answers[q.id] === c ? 'border-color:#9b0000;color:#9b0000' : ''"
                @click="answers[q.id] = c" style="padding:4px 10px;font-size:12px">{{ c }}</button>
            </div>
          </div>
        </details>
      </div>
      <div class="replica-submit section-heading">
        <p class="muted">已答 {{ Object.keys(answers).length }}/{{ questions.length }} 题</p>
        <button class="primary" :disabled="loading || !Object.keys(answers).length" @click="replay">{{ loading ? '计算中…' : '运行证据试算' }}</button>
      </div>
    </template>
  </section>

  <section v-if="result" class="panel">
    <h2>试算结果</h2>
    <h3>前六大能力</h3>
    <div class="table-scroll"><table>
      <thead><tr><th>能力</th><th>参考分</th></tr></thead>
      <tbody><tr v-for="a in result.ability_summary.top_six" :key="a.item"><td>{{ a.name }}</td><td>{{ a.value }}</td></tr></tbody>
    </table></div>
    <h3>待发展三项</h3>
    <div class="table-scroll"><table>
      <thead><tr><th>能力</th><th>参考分</th></tr></thead>
      <tbody><tr v-for="a in result.ability_summary.bottom_three" :key="a.item"><td>{{ a.name }}</td><td>{{ a.value }}</td></tr></tbody>
    </table></div>
    <h3>角色分数</h3>
    <div class="table-scroll"><table>
      <thead><tr><th>角色</th><th>综合</th></tr></thead>
      <tbody><tr v-for="r in result.roles" :key="r.name"><td>{{ r.name }}</td><td>{{ r.scoreTotal }}</td></tr></tbody>
    </table></div>
    <h3>前十大才干</h3>
    <div class="table-scroll"><table>
      <thead><tr><th>#</th><th>才干</th><th>原始分</th></tr></thead>
      <tbody><tr v-for="(r, i) in result.rows.filter(r => r.type === 2).slice(0, 10)" :key="r.item"><td>{{ i + 1 }}</td><td>{{ r.name }}</td><td>{{ r.score }}</td></tr></tbody>
    </table></div>
  </section>
</template>
