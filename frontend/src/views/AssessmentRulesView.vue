<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../logic/api';
import Notice from '../components/Notice.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy assessment-rules.tsx: rule catalog with per-rule formula/source/scope rows.
type Rule = { id: string; title: string; formula: string; source: string; scope: string };
type Catalog = { engine_version: string; rules: Rule[]; excluded: string[] };
const catalog = ref<Catalog | null>(null);
const error = ref('');
const active = ref<string | null>(null);
const busy = ref(false);
const verified = ref(false);

async function load() {
  error.value = '';
  try {
    catalog.value = await api<Catalog>('/assessment/rules');
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

async function revalidate() {
  busy.value = true;
  error.value = '';
  try {
    await api('/assessment/rules/validate', {});
    verified.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <div class="section-heading">
      <h2>现在能否完成整套匹配？</h2>
      <button :disabled="busy || !catalog" @click="revalidate">{{ busy ? '处理中…' : '重新检查发布条件' }}</button>
    </div>
    <Notice v-if="error" kind="error">{{ error }}</Notice>
    <Notice v-if="verified">发布条件检查已运行：完整高级报告与正式匹配仍被阻止，原因见规则范围。</Notice>
  </section>

  <RetryBox v-if="error && !catalog" :text="error" @retry="load" />
  <LoadingState v-else-if="!catalog" text="正在读取规则目录…" />
  <section v-else class="panel">
    <div class="section-heading">
      <div><h2>规则目录 · {{ catalog.engine_version }}</h2><p>每条规则给出公式、证据来源与适用边界。</p></div>
    </div>
    <div class="table-scroll">
      <table>
        <thead><tr><th>规则</th><th class="rule-description">公式</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="r in catalog.rules" :key="r.id">
            <td><strong>{{ r.id }}</strong><small>{{ r.title }}</small></td>
            <td class="rule-description"><span class="formula">{{ r.formula }}</span></td>
            <td><button class="text-button" @click="active = active === r.id ? null : r.id">{{ active === r.id ? '收起' : '依据与边界' }}</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-for="r in catalog.rules.filter(x => x.id === active)" :key="r.id" class="rule-result">
      <p><strong>{{ r.id }} · {{ r.title }}</strong></p>
      <p class="formula">{{ r.formula }}</p>
      <p>来源：{{ r.source }}</p>
      <p>适用范围：{{ r.scope }}</p>
    </div>
    <h3>排除的公式（旧系统错误做法）</h3>
    <ul class="limitations">
      <li v-for="e in catalog.excluded" :key="e">{{ e }}</li>
    </ul>
  </section>
</template>
