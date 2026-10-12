<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../logic/api';

type Rule = { id: string; title: string; formula: string; source: string; scope: string };
type Catalog = { engine_version: string; rules: Rule[]; excluded: string[] };
const catalog = ref<Catalog | null>(null);
const activeRule = ref<Rule | null>(null);

onMounted(async () => {
  catalog.value = await api<Catalog>('/assessment/rules');
});
</script>

<template>
  <div v-if="catalog">
    <h2>测评规则</h2>
    <el-tag>引擎版本: {{ catalog.engine_version }}</el-tag>
    <el-table :data="catalog.rules" style="margin-top: 16px" @row-click="(row: Rule) => activeRule = row">
      <el-table-column prop="id" label="ID" width="120" />
      <el-table-column prop="title" label="规则" />
    </el-table>

    <el-drawer v-model="activeRule" :title="activeRule?.title" size="50%">
      <template v-if="activeRule">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="公式">{{ activeRule.formula }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ activeRule.source }}</el-descriptions-item>
          <el-descriptions-item label="适用范围">{{ activeRule.scope }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>

    <h4>排除的公式（旧系统错误做法）</h4>
    <ul>
      <li v-for="e in catalog.excluded" :key="e" style="color: #909399">{{ e }}</li>
    </ul>
  </div>
</template>
