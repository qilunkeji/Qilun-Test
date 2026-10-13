<script setup lang="ts">
// Report view: 28 abilities full list + top/bottom summary + PNG export via the
// ported DOM-serialization engine (framework-agnostic report-export.ts).
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { saveReportImage, printReport } from '../logic/report-export';
import ReportStudio from './ReportStudioView.vue';

type Ability = { item: string; name: string; parent: string; value: number };
type Report = {
  result: {
    abilities: Ability[];
    ability_summary: { top_six: Ability[]; bottom_three: Ability[]; groups: { item: string; name: string; value: number }[]; potential5: Record<string, number>; potentialMs: Record<string, number> };
    rows: { item: string; name: string; type: number; score: number }[];
    roles: { item: string; name: string; ename: string; scoreB: number; scoreC: number; scoreD: number; scoreNotion: number; scoreTotal: number }[];
    report_text: { temperament: { name: string; text: string }; motivation: { lines: { type: string; label: string; name: string }[] } };
  };
};

const router = useRouter();
const report = ref<Report | null>(null);
const token = ref('');
const participantName = ref('');
const exporting = ref(false);
const exportError = ref('');
const sheetEl = ref<HTMLElement | null>(null);

const strengths = computed(() => report.value ? [...report.value.result.rows].filter(r => r.type === 2).sort((a, b) => b.score - a.score).slice(0, 10) : []);

async function exportPng() {
  if (!sheetEl.value) return;
  exporting.value = true;
  exportError.value = '';
  try {
    await saveReportImage(sheetEl.value, `${participantName.value || '齐论'}-测评报告.png`);
  } catch (e) {
    exportError.value = (e as Error).message;
  } finally {
    exporting.value = false;
  }
}

onMounted(() => {
  token.value = location.hash.slice(1);
  const raw = localStorage.getItem(`qilun-report:${token.value}`);
  if (!raw) { router.push({ name: 'h5-entry' }); return; }
  report.value = JSON.parse(raw);
  const profile = localStorage.getItem(`qilun-profile:${token.value}`);
  if (profile) participantName.value = JSON.parse(profile).name ?? '';
});
</script>

<template>
  <main class="h5-shell h5-reference h5-reference-report" v-if="report">
    <div class="h5-brand no-print">
      <img src="/brand/qilun-logo-light.png" alt="齐论AI" />
      <span>个人参考报告</span>
    </div>
    <section class="h5-card">
      <h1>{{ report.result?.report_text?.temperament?.name ? `${participantName} · ${report.result.report_text.temperament.name}` : '齐论性格与发展测评 · 参考报告' }}</h1>
      <div class="h5-reference-notice">能力分数是固定模型推算的参考评分，不等同于实际技能或绩效，不用于自动录用或淘汰。</div>

      <div class="h5-result-section">
        <h2>最突出的六项能力</h2>
        <div class="h5-metrics">
          <div v-for="a in report.result.ability_summary.top_six" :key="a.item">
            <span>{{ a.name }}</span>
            <div class="h5-metric-track"><i :style="{ width: `${Math.min(100, a.value)}%`, background: '#9b0000' }" /></div>
            <b>{{ a.value.toFixed(0) }}</b>
          </div>
        </div>
      </div>

      <div class="h5-result-section">
        <h2>待发展的三项</h2>
        <div class="h5-metrics">
          <div v-for="a in report.result.ability_summary.bottom_three" :key="a.item">
            <span>{{ a.name }}</span>
            <div class="h5-metric-track"><i :style="{ width: `${Math.min(100, a.value)}%`, background: '#7d1316' }" /></div>
            <b>{{ a.value.toFixed(0) }}</b>
          </div>
        </div>
      </div>

      <div class="h5-result-section">
        <h2>前十大才干</h2>
        <ol style="padding-left:20px">
          <li v-for="(r, i) in strengths" :key="r.item">{{ r.name }}<small style="color:#5f5b5b"> · 原始分 {{ r.score }}</small></li>
        </ol>
      </div>
    </section>

    <ReportStudio :report="report" :person-name="participantName" :submitted-at="null" />

    <div class="h5-card no-print">
      <p v-if="exportError" role="alert">{{ exportError }}</p>
      <div class="h5-actions">
        <button class="primary" :disabled="exporting" @click="exportPng">{{ exporting ? '正在导出…' : '导出 PNG' }}</button>
        <button @click="printReport(participantName || undefined)">打印 / 保存 PDF</button>
      </div>
      <p class="h5-reference-footer">报告仅用于自我理解与发展沟通；引用与推导过程可在报告中逐条核对。</p>
    </div>
  </main>
</template>
