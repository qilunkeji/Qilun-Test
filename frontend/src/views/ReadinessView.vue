<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../logic/api';
import BadgePill from '../components/BadgePill.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy Readiness (main.tsx): 功能与接入状态 rows.
type Feature = { name: string; status: string; detail: string };
const data = ref<{ features: Feature[] } | null>(null);
const error = ref('');

async function load() {
  error.value = '';
  data.value = null;
  try {
    data.value = await api<{ features: Feature[] }>('/readiness');
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);

const labels: Record<string, string> = {
  available: '本地已实现', requires_model: '需配置及授权', waiting_for_authorization: '待授权',
  blocked_missing_rules: '原版规则未齐', waiting_for_configuration: '待配置',
};
</script>

<template>
  <div class="section-heading">
    <div>
      <h2>功能与接入状态</h2>
      <p>这里记录本地实现与外部依赖；连接状态未检测时不代表健康。</p>
    </div>
  </div>
  <section class="panel">
    <RetryBox v-if="error" :text="error" @retry="load" />
    <LoadingState v-else-if="!data" text="正在读取系统状态…" />
    <template v-else>
      <div v-for="x in data.features" :key="x.name" class="readiness-row">
        <div>
          <h3>{{ x.name }}</h3>
          <p>{{ x.detail }}</p>
          <p class="muted">{{ labels[x.status] ?? '未实现' }}{{ x.status === 'requires_model' ? ' · 配置情况见模型与接入；每次材料需另行许可。连接健康未检测，无最近检测时间。' : '' }}</p>
        </div>
        <BadgePill>{{ labels[x.status] ?? '待开发' }}</BadgePill>
      </div>
    </template>
  </section>
</template>
