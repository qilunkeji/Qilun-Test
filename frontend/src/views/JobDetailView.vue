<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, date, statusLabels, type JobDetail } from '../logic/api';
import Notice from '../components/Notice.vue';
import BadgePill from '../components/BadgePill.vue';
import LoadingState from '../components/LoadingState.vue';
import RetryBox from '../components/RetryBox.vue';

// Legacy job detail (jobs.tsx): section-heading + version details list.
const route = useRoute();
const router = useRouter();
const detail = ref<JobDetail | null>(null);
const error = ref('');
const refresh = ref(0);

async function load() {
  error.value = '';
  detail.value = null;
  try {
    detail.value = await api<JobDetail>(`/jobs/${route.params.id}`);
  } catch {
    error.value = '岗位暂不可访问，请确认账号权限或稍后重试。';
  }
}
onMounted(load);

const current = computed(() => detail.value?.versions[0]);
</script>

<template>
  <RetryBox v-if="error" :text="error" @retry="refresh++; load()" />
  <LoadingState v-else-if="!detail" text="正在读取岗位…" />
  <section v-else class="panel">
    <div class="section-heading">
      <div>
        <button class="text-button" @click="router.push('/jobs')">← 返回岗位列表</button>
        <h2>{{ current?.title }} <BadgePill>V{{ detail.revision }}</BadgePill></h2>
      </div>
      <button class="primary" @click="router.push(`/jobs/${detail.id}/edit`)">修改并保存新版本</button>
    </div>
    <Notice>岗位版本由人工确认。招聘优化可辅助拟稿；本页保存不向任何外部招聘渠道发布。</Notice>
    <details v-for="v in detail.versions" :key="v.id" class="version" :open="v.id === current?.id">
      <summary>V{{ v.version }} · {{ statusLabels[v.status] ?? v.status }} · {{ date(v.created_at) }}<span>{{ v.change_reason }}</span></summary>
      <div class="metadata"><span>{{ v.department }}</span><span>负责人：{{ v.owner }}</span><span>{{ v.location }}</span></div>
      <h3>核心任务</h3><p class="preserve">{{ v.tasks }}</p>
      <h3>岗位证据标准</h3><p class="preserve">{{ v.criteria }}</p>
      <h3>对外 JD</h3><p class="preserve">{{ v.public_jd }}</p>
      <p class="muted mono wrap">版本引用：{{ v.id }}</p>
    </details>
  </section>
</template>
