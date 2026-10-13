<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';

// Legacy rule-experiment.tsx: synthetic method comparison panel.
type Row = { items: number[]; keyed: number[]; sum: number; normalized: number };
type ExperimentResult = {
  version: string; status: string;
  candidate: Row[]; benchmarks: Row[][];
  target: number[]; weights: number[]; differences: number[]; components: number[];
  alternatives: { weighted_linear: number; weighted_quadratic: number; bottleneck: number };
  spread: number; trace: string[]; limitations: string[];
};
const loading = ref(false);
const result = ref<ExperimentResult | null>(null);
const error = ref('');
const form = ref({
  answers: [3, 3, 3, 3, 3, 3] as number[],
  benchmarks: [[4, 2, 3, 3, 4, 2], [3, 3, 4, 2, 3, 3]] as number[][],
  aggregation: 'median' as 'mean' | 'median',
  weights: [2, 1, 0.5],
});

async function run() {
  loading.value = true;
  error.value = '';
  try {
    result.value = await api<ExperimentResult>('/assessment/rules/experiment', { purpose: 'synthetic_method_comparison', ...form.value });
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <div><h2>规则参数实验</h2><p>合成样例的方法对比；不使用任何真实答卷。</p></div>
    </div>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <form class="form-grid" @submit.prevent="run">
      <div class="wide">
        <h3>候选人答案（6 项，1–5）</h3>
        <div class="actions" style="flex-wrap:wrap">
          <label v-for="i in 6" :key="i" class="field" style="width:72px">
            <span>第{{ i }}项</span>
            <input v-model.number="form.answers[i - 1]" type="number" min="1" max="5" required />
          </label>
        </div>
      </div>
      <div class="wide">
        <h3>标杆组（每组 6 项）</h3>
        <div v-for="(bench, bi) in form.benchmarks" :key="bi" class="actions" style="flex-wrap:wrap;margin-bottom:6px">
          <label v-for="i in 6" :key="i" class="field" style="width:72px">
            <span>第{{ i }}项</span>
            <input v-model.number="bench[i - 1]" type="number" min="1" max="5" required />
          </label>
          <button v-if="form.benchmarks.length > 1" type="button" @click="form.benchmarks.splice(bi, 1)">删除此组</button>
        </div>
        <button v-if="form.benchmarks.length < 5" type="button" @click="form.benchmarks.push([3, 3, 3, 3, 3, 3])">＋ 添加标杆组</button>
      </div>
      <label class="field"><span>聚合方式</span>
        <select v-model="form.aggregation"><option value="mean">均值</option><option value="median">中位数</option></select>
      </label>
      <div class="field">
        <span>权重（3 项）</span>
        <div class="actions" style="flex-wrap:wrap">
          <label v-for="i in 3" :key="i" class="field" style="width:88px">
            <span>W{{ i }}</span>
            <input v-model.number="form.weights[i - 1]" type="number" step="0.1" min="0.1" max="100" required />
          </label>
        </div>
      </div>
      <div class="form-footer">
        <p>结果仅用于核对实现，不生成任何招聘结论。</p>
        <button class="primary" :disabled="loading">{{ loading ? '计算中…' : '运行合成实验' }}</button>
      </div>
    </form>
  </section>

  <section v-if="result" class="panel">
    <div class="section-heading">
      <div><h2>结果 · {{ result.version }}</h2><p>状态：{{ result.status }}</p></div>
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>方法</th><th>数值</th></tr></thead>
        <tbody>
          <tr><td>线性加权</td><td>{{ result.alternatives.weighted_linear.toFixed(2) }}</td></tr>
          <tr><td>二次加权</td><td>{{ result.alternatives.weighted_quadratic.toFixed(2) }}</td></tr>
          <tr><td>短板法</td><td>{{ result.alternatives.bottleneck.toFixed(2) }}</td></tr>
          <tr><td>极差</td><td>{{ result.spread.toFixed(2) }}</td></tr>
        </tbody>
      </table>
    </div>
    <h3>中间数据</h3>
    <div class="table-scroll">
      <table>
        <thead><tr><th>题目对</th><th>原始和</th><th>标准化</th><th>目标值</th><th>分项得分</th></tr></thead>
        <tbody>
          <tr v-for="(c, i) in result.candidate" :key="i">
            <td>{{ c.items[0] }}-{{ c.items[1] }}</td>
            <td>{{ c.sum }}</td>
            <td>{{ c.normalized.toFixed(3) }}</td>
            <td>{{ result.target[i].toFixed(3) }}</td>
            <td>{{ result.components[i].toFixed(3) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <h3>局限</h3>
    <ul class="limitations"><li v-for="l in result.limitations" :key="l">{{ l }}</li></ul>
  </section>
</template>
