<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../logic/api';

type Gap = { id: string; title: string; detail: string; files: string[] };
type Catalog = {
  version: string; answer_only_derived_available: boolean;
  choices: { paired: string[]; single: string[] };
  values: { id: string; title: string; description?: string }[];
  gaps: Gap[];
};
const catalog = ref<Catalog | null>(null);
const activeTab = ref('choices');

onMounted(async () => { catalog.value = await api<Catalog>('/assessment/gh-evidence'); });
</script>

<template>
  <div v-if="catalog" style="max-width: 800px">
    <h2>证据字典</h2>
    <el-tag>{{ catalog.version }}</el-tag>
    <el-tabs v-model="activeTab" style="margin-top: 16px">
      <el-tab-pane label="选项定义" name="choices">
        <h4>A/B 配对题选项</h4>
        <el-tag v-for="c in catalog.choices.paired" :key="c" style="margin: 4px">{{ c }}</el-tag>
        <h4>单陈述题选项</h4>
        <el-tag v-for="c in catalog.choices.single" :key="c" type="success" style="margin: 4px">{{ c }}</el-tag>
      </el-tab-pane>
      <el-tab-pane label="价值观词库" name="values">
        <el-table :data="catalog.values" size="small">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="title" label="词语" />
          <el-table-column prop="description" label="说明" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="材料缺口" name="gaps">
        <el-collapse>
          <el-collapse-item v-for="g in catalog.gaps" :key="g.id" :title="g.title">
            <p>{{ g.detail }}</p>
            <ul v-if="g.files"><li v-for="f in g.files" :key="f">{{ f }}</li></ul>
          </el-collapse-item>
        </el-collapse>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>
