<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type ExperimentResult = {
  version: string; status: string;
  candidate: { items: number[]; keyed: number[]; sum: number; normalized: number }[];
  benchmarks: { items: number[]; keyed: number[]; sum: number; normalized: number }[][];
  target: number[]; weights: number[]; differences: number[]; components: number[];
  alternatives: { weighted_linear: number; weighted_quadratic: number; bottleneck: number };
  spread: number; trace: string[]; limitations: string[];
};
const loading = ref(false);
const result = ref<ExperimentResult | null>(null);
const form = ref({
  answers: [3, 3, 3, 3, 3, 3] as number[],
  benchmarks: [[4, 2, 3, 3, 4, 2], [3, 3, 4, 2, 3, 3]] as number[][],
  aggregation: 'median' as 'mean' | 'median',
  weights: [2, 1, 0.5],
});

async function run() {
  loading.value = true;
  try {
    result.value = await api<ExperimentResult>('/assessment/rules/experiment', { purpose: 'synthetic_method_comparison', ...form.value });
  } catch (e) { ElMessage.error((e as Error).message); } finally { loading.value = false; }
}
</script>

<template>
  <div style="max-width: 800px">
    <h2>规则参数实验</h2>
    <el-card style="margin-bottom: 16px">
      <el-form label-position="top">
        <el-form-item label="候选人答案（6 项 1-5）">
          <div style="display: flex; gap: 8px">
            <el-input-number v-for="i in 6" :key="i" v-model="form.answers[i-1]" :min="1" :max="5" size="small" />
          </div>
        </el-form-item>
        <el-form-item label="标杆组（每组 6 项）">
          <div v-for="(bench, bi) in form.benchmarks" :key="bi" style="display: flex; gap: 8px; margin-bottom: 4px">
            <el-input-number v-for="i in 6" :key="i" v-model="bench[i-1]" :min="1" :max="5" size="small" />
            <el-button v-if="form.benchmarks.length > 1" size="small" circle @click="form.benchmarks.splice(bi, 1)">−</el-button>
          </div>
          <el-button v-if="form.benchmarks.length < 5" size="small" @click="form.benchmarks.push([3,3,3,3,3,3])">添加标杆</el-button>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="聚合方式">
              <el-radio-group v-model="form.aggregation">
                <el-radio-button value="mean">均值</el-radio-button>
                <el-radio-button value="median">中位数</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="14">
            <el-form-item label="权重（3 项）">
              <div style="display: flex; gap: 8px">
                <el-input-number v-for="i in 3" :key="i" v-model="form.weights[i-1]" :min="0.1" :max="100" size="small" />
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-button type="primary" :loading="loading" @click="run" style="width: 100%">运行实验</el-button>
      </el-form>
    </el-card>

    <template v-if="result">
      <h4>结果</h4>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="线性加权">{{ result.alternatives.weighted_linear.toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="二次加权">{{ result.alternatives.weighted_quadratic.toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="短板">{{ result.alternatives.bottleneck.toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="极差">{{ result.spread.toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ result.status }}</el-descriptions-item>
        <el-descriptions-item label="版本">{{ result.version }}</el-descriptions-item>
      </el-descriptions>
      <h4>中间数据</h4>
      <el-table :data="result.candidate.map((c, i) => ({ key: `${c.items[0]}-${c.items[1]}`, sum: c.sum, normalized: c.normalized, target: result!.target[i], component: result!.components[i] }))" size="small">
        <el-table-column prop="key" label="题目对" width="80" />
        <el-table-column prop="sum" label="原始和" width="80" />
        <el-table-column prop="normalized" label="标准化" width="80" />
        <el-table-column prop="target" label="目标值" width="80" />
        <el-table-column prop="component" label="得分" width="80" />
      </el-table>
      <h4>局限</h4>
      <ul><li v-for="l in result.limitations" :key="l" style="color: #909399">{{ l }}</li></ul>
    </template>
  </div>
</template>
