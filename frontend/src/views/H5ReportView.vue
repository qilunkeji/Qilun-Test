<script setup lang="ts">
// Report view: 28 abilities full list + top/bottom summary + PNG export via the
// ported DOM-serialization engine (framework-agnostic report-export.ts).
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { saveReportImage, printReport } from '../logic/report-export';

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
const sheetEl = ref<HTMLElement | null>(null);

const abilityGroups = computed(() => {
  if (!report.value) return [];
  const byParent = new Map<string, Ability[]>();
  for (const a of report.value.result.abilities) {
    const list = byParent.get(String(a.parent)) ?? [];
    list.push(a);
    byParent.set(String(a.parent), list);
  }
  return [...byParent.entries()].map(([parent, items]) => ({ parent, items: [...items].sort((x, y) => y.value - x.value) }));
});

const strengths = computed(() => report.value ? [...report.value.result.rows].filter(r => r.type === 2).sort((a, b) => b.score - a.score).slice(0, 10) : []);

async function exportPng() {
  if (!sheetEl.value) return;
  exporting.value = true;
  try {
    await saveReportImage(sheetEl.value, `${participantName.value || '齐论'}-测评报告.png`);
  } catch (e) {
    (await import('element-plus')).ElMessage.error((e as Error).message);
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
  <div ref="sheetEl" style="max-width: 720px; margin: 0 auto; padding: 16px" v-if="report">
    <h3>{{ report.result?.report_text?.temperament?.name ? `${participantName} · ${report.result.report_text.temperament.name}` : '齐论性格与发展测评 · 参考报告' }}</h3>
    <el-alert type="info" :closable="false" show-icon title="能力分数是固定模型推算的参考评分，不等同于实际技能或绩效，不用于自动录用或淘汰。" style="margin-bottom: 16px" />

    <h4>最突出的六项能力</h4>
    <el-table :data="report.result.ability_summary.top_six" size="small" style="margin-bottom: 16px">
      <el-table-column prop="name" label="能力" />
      <el-table-column prop="value" label="参考分" width="100" />
    </el-table>

    <h4>待发展的三项</h4>
    <el-table :data="report.result.ability_summary.bottom_three" size="small" style="margin-bottom: 16px">
      <el-table-column prop="name" label="能力" />
      <el-table-column prop="value" label="参考分" width="100" />
    </el-table>

    <h4>全部 28 项能力</h4>
    <el-table :data="report.result.abilities" size="small" style="margin-bottom: 16px">
      <el-table-column prop="name" label="能力" />
      <el-table-column prop="value" label="参考分" width="100" />
    </el-table>

    <h4>前十大才干</h4>
    <el-table :data="strengths" size="small" style="margin-bottom: 16px">
      <el-table-column type="index" label="#" width="50" />
      <el-table-column prop="name" label="才干" />
      <el-table-column prop="score" label="原始分" width="100" />
    </el-table>

    <div style="display: flex; gap: 8px">
      <el-button type="primary" :loading="exporting" @click="exportPng">导出 PNG</el-button>
      <el-button @click="printReport(participantName || undefined)">打印/保存 PDF</el-button>
    </div>
  </div>
</template>
