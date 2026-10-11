<script setup lang="ts">
// Report view: shows the submitted fixed-standard report summary (28 abilities top six etc.).
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

type Ability = { item: string; name: string; parent: string; value: number };
type Report = { result: { abilities: Ability[]; ability_summary: { top_six: Ability[]; bottom_three: Ability[] } } };

const router = useRouter();
const report = ref<Report | null>(null);
const token = ref('');

onMounted(() => {
  token.value = location.hash.slice(1);
  const raw = localStorage.getItem(`qilun-report:${token.value}`);
  if (!raw) { router.push({ name: 'h5-entry' }); return; }
  report.value = JSON.parse(raw);
});
</script>

<template>
  <div style="max-width: 640px; margin: 0 auto; padding: 16px" v-if="report">
    <h3>齐论性格与发展测评 · 参考报告</h3>
    <el-alert type="info" :closable="false" show-icon title="能力分数是固定模型推算的参考评分，不等同于实际技能或绩效，不用于自动录用或淘汰。" style="margin-bottom: 16px" />
    <h4>最突出的六项能力</h4>
    <el-table :data="report.result.ability_summary.top_six" size="small">
      <el-table-column prop="name" label="能力" />
      <el-table-column prop="value" label="参考分" width="100" />
    </el-table>
    <h4>待发展的三项</h4>
    <el-table :data="report.result.ability_summary.bottom_three" size="small">
      <el-table-column prop="name" label="能力" />
      <el-table-column prop="value" label="参考分" width="100" />
    </el-table>
    <el-button style="margin-top: 16px" @click="window?.print?.() ?? print()">打印/保存 PDF</el-button>
  </div>
</template>
