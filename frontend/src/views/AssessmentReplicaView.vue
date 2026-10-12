<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Ability = { item: string; name: string; value: number };
type ReplayResult = { abilities: Ability[]; ability_summary: { top_six: Ability[]; bottom_three: Ability[] }; rows: { item: number; name: string; type: number; score: number }[]; roles: { name: string; scoreTotal: number }[] };
const loading = ref(false);
const result = ref<ReplayResult | null>(null);
type Question = { id: string; title: string; answer_type: number };
const questions = ref<Question[]>([]);
const answers = ref<Record<string, number>>({});

async function loadPackage() {
  // 用 standard 包的题目
  const me = await (await fetch('/api/v1/auth/me')).json();
  const csrf = me.data.csrf_token;
  const invite = await (await fetch('/api/v1/assessment/invites', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ purpose: '复刻面板', days: 1 })
  })).json();
  if (!invite.data?.url) { ElMessage.error('无法获取题目'); return; }
  const token = invite.data.url.split('#')[1];
  const open = await (await fetch('/api/v1/public/assessment/entry/open', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token })
  })).json();
  const enroll = await (await fetch('/api/v1/public/assessment/entry/enroll', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token, participant_key: 'ReplicaPanel' + '0123456789012345678901234', accepted: true, consent_version: open.data.consent_version, profile: { name: '复刻', phone: '13800000000', birth_date: '1990-01-01' } })
  })).json();
  const personal = await (await fetch('/api/v1/public/assessment/open', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ token: enroll.data.token })
  })).json();
  questions.value = personal.data.package.questions;
  window._replicaToken = enroll.data.token;
  window._replicaGroups = personal.data.package.value_groups;
}

async function replay() {
  loading.value = true;
  try {
    const groups = window._replicaGroups as string[][];
    const selected = groups.map((g: string[]) => g.slice(0, 5));
    const ranked = selected.flat().slice(0, 10);
    const values = ranked.map((id: string, i: number) => ({ id, rank: i + 1 }));
    const res = await api<ReplayResult>('/assessment/gh-replay/score', {
      version: 'gh-report-replay-v22', purpose: 'evidence_verification_only', input_kind: 'manual_answers',
      answers: answers.value, values,
      value_flow: { layout: 'captured_32_words_v3', selected_by_group: selected, ranked },
    });
    result.value = res;
  } catch (e) { ElMessage.error((e as Error).message); } finally { loading.value = false; }
}

onMounted(loadPackage);
</script>

<template>
  <div style="max-width: 900px">
    <h2>277 题复刻计算面板</h2>
    <el-alert type="info" :closable="false" show-icon title="逐题作答后点击「计算」，服务端按已知公式复算全部指标。" style="margin-bottom: 16px" />

    <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e4e7ed; border-radius: 4px; padding: 8px; margin-bottom: 16px">
      <div v-for="q in questions.slice(0, 50)" :key="q.id" style="display: flex; align-items: center; gap: 8px; padding: 2px 0">
        <span style="width: 36px; text-align: right; color: #909399; font-size: 12px">{{ q.id }}</span>
        <el-rate v-model="answers[q.id]" :max="5" :allow-half="false" style="flex: 1" />
      </div>
      <el-collapse>
        <el-collapse-item :title="`显示剩余 ${questions.length - 50} 题`">
          <div v-for="q in questions.slice(50)" :key="q.id" style="display: flex; align-items: center; gap: 8px; padding: 2px 0">
            <span style="width: 36px; text-align: right; color: #909399; font-size: 12px">{{ q.id }}</span>
            <el-rate v-model="answers[q.id]" :max="5" :allow-half="false" style="flex: 1" />
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <el-button type="primary" :loading="loading" @click="replay" style="width: 100%; margin-bottom: 16px">计算</el-button>

    <template v-if="result">
      <h4>前六大能力</h4>
      <el-table :data="result.ability_summary.top_six" size="small">
        <el-table-column prop="name" label="能力" />
        <el-table-column prop="value" label="参考分" width="100" />
      </el-table>
      <h4>待发展三项</h4>
      <el-table :data="result.ability_summary.bottom_three" size="small">
        <el-table-column prop="name" label="能力" />
        <el-table-column prop="value" label="参考分" width="100" />
      </el-table>
      <h4>角色分数</h4>
      <el-table :data="result.roles" size="small">
        <el-table-column prop="name" label="角色" />
        <el-table-column prop="scoreTotal" label="综合" width="100" />
      </el-table>
      <h4>前十大才干</h4>
      <el-table :data="result.rows.filter(r => r.type === 2).slice(0, 10)" size="small">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="name" label="才干" />
        <el-table-column prop="score" label="原始分" width="100" />
      </el-table>
    </template>
  </div>
</template>
