<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';
import BadgePill from '../components/BadgePill.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy gh-evidence.tsx: evidence dictionary (choices / values / gaps).
type Gap = { id: string; title: string; detail: string; files?: string[] };
type Catalog = {
  version: string; answer_only_derived_available: boolean;
  choices: { paired: string[]; single: string[] };
  values: { id: string; title: string; description?: string }[];
  gaps: Gap[];
};
const catalog = ref<Catalog | null>(null);
const error = ref('');
const activeTab = ref('choices');

async function load() {
  error.value = '';
  try {
    catalog.value = await api<Catalog>('/assessment/gh-evidence');
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
</script>

<template>
  <RetryBox v-if="error && !catalog" :text="error" @retry="load" />
  <LoadingState v-else-if="!catalog" text="正在读取证据字典…" />
  <section v-else class="panel">
    <div class="section-heading">
      <div><h2>证据字典 · {{ catalog.version }}</h2><p>题目选项、价值词库与材料缺口的当前证据范围。</p></div>
      <BadgePill>{{ catalog.answer_only_derived_available ? '答案层衍生可用' : '仅原始答案' }}</BadgePill>
    </div>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <div class="tabbar" aria-label="证据字典栏目">
      <button :aria-pressed="activeTab === 'choices'" :class="{ active: activeTab === 'choices' }" @click="activeTab = 'choices'">选项定义</button>
      <button :aria-pressed="activeTab === 'values'" :class="{ active: activeTab === 'values' }" @click="activeTab = 'values'">价值观词库</button>
      <button :aria-pressed="activeTab === 'gaps'" :class="{ active: activeTab === 'gaps' }" @click="activeTab = 'gaps'">材料缺口</button>
    </div>

    <template v-if="activeTab === 'choices'">
      <h3>A/B 配对题选项</h3>
      <p><BadgePill v-for="c in catalog.choices.paired" :key="c">{{ c }}</BadgePill></p>
      <h3>单陈述题选项</h3>
      <p><BadgePill v-for="c in catalog.choices.single" :key="c">{{ c }}</BadgePill></p>
    </template>

    <div v-else-if="activeTab === 'values'" class="table-scroll">
      <table>
        <thead><tr><th>ID</th><th>词语</th><th>说明</th></tr></thead>
        <tbody>
          <tr v-for="v in catalog.values" :key="v.id"><td><span class="mono">{{ v.id }}</span></td><td>{{ v.title }}</td><td>{{ v.description ?? '—' }}</td></tr>
        </tbody>
      </table>
    </div>

    <template v-else>
      <div v-for="g in catalog.gaps" :key="g.id" class="rule-item">
        <p><strong>{{ g.title }}</strong></p>
        <p>{{ g.detail }}</p>
        <p v-if="g.files?.length" class="muted mono">涉及：{{ g.files.join('、') }}</p>
      </div>
    </template>
  </section>
</template>
